#!/usr/bin/env python3
"""Local viewer for the official TSE results. Python standard library only."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import threading
import time
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlsplit
from urllib.request import Request, urlopen
import webbrowser

ROOT = Path(__file__).resolve().parent
BASE = "https://resultados.tse.jus.br/oficial/"
CARGOS = {"1": "Presidente", "3": "Governador", "5": "Senador",
          "6": "Deputado federal", "7": "Deputado estadual"}
STATE_NAMES = {
    "ac": "Acre", "al": "Alagoas", "am": "Amazonas", "ap": "Amap\u00e1",
    "ba": "Bahia", "ce": "Cear\u00e1", "df": "Distrito Federal", "es": "Esp\u00edrito Santo",
    "go": "Goi\u00e1s", "ma": "Maranh\u00e3o", "mg": "Minas Gerais", "ms": "Mato Grosso do Sul",
    "mt": "Mato Grosso", "pa": "Par\u00e1", "pb": "Para\u00edba", "pe": "Pernambuco",
    "pi": "Piau\u00ed", "pr": "Paran\u00e1", "rj": "Rio de Janeiro", "rn": "Rio Grande do Norte",
    "ro": "Rond\u00f4nia", "rr": "Roraima", "rs": "Rio Grande do Sul", "sc": "Santa Catarina",
    "se": "Sergipe", "sp": "S\u00e3o Paulo", "to": "Tocantins", "zz": "Exterior", "br": "Brasil",
}
cache = {}
cache_lock = threading.Lock()


def fetch_json(path, ttl=8):
    with cache_lock:
        saved = cache.get(path)
        if saved and time.monotonic() - saved[0] < ttl:
            return saved[1]
    request = Request(BASE + path + "?nocache=" + str(time.time_ns()),
                      headers={"User-Agent": "ApuracaoLocal/1.0", "Accept": "application/json"})
    with urlopen(request, timeout=10) as response:
        data = json.load(response)
    with cache_lock:
        cache[path] = (time.monotonic(), data)
    return data


def number(value):
    return float(str(value or "0").replace(",", "."))


def normalize(data, cargo, ciclo, election, uf, path):
    candidates = []
    for item in data.get("carg", []):
        if str(item["cd"]) != cargo:
            continue
        for group in item.get("agr", []):
            for party in group.get("par", []):
                for candidate in party.get("cand", []):
                    seq = str(candidate.get("sqcand", ""))
                    candidates.append({
                        "number": str(candidate["n"]),
                        "name": candidate.get("nmu") or candidate.get("nm", ""),
                        "party": party.get("sg", ""),
                        "votes": int(candidate.get("vap") or 0),
                        "percent": number(candidate.get("pvap")),
                        "status": candidate.get("st") or "",
                        "elected": candidate.get("e") == "s",
                        "photo": BASE + f"{ciclo}/{election}/fotos/{uf}/{seq}.jpeg" if seq.isdigit() else "",
                    })
    candidates.sort(key=lambda c: (-c["votes"], c["name"], c["number"]))
    last_votes = None
    rank = 0
    for index, candidate in enumerate(candidates):
        if candidate["votes"] != last_votes:
            rank = index + 1
            last_votes = candidate["votes"]
        candidate["rank"] = rank if candidate["votes"] > 0 else None
    votes, sections = data.get("v", {}), data.get("s", {})
    return {
        "id": cargo, "name": CARGOS[cargo], "uf": uf.upper(),
        "candidates": candidates, "source": BASE + path,
        "generated": f"{data.get('dg', '')} {data.get('hg', '')}".strip(),
        "totalized": f"{data.get('dt', '')} {data.get('ht', '')}".strip(),
        "generationId": data.get("idg"),
        "sections": int(sections.get("st") or 0),
        "totalSections": int(sections.get("ts") or 0),
        "sectionPercent": number(sections.get("pst")),
        "totalVotes": int(votes.get("tv") or 0),
        "whiteVotes": int(votes.get("vb") or 0), "whitePercent": number(votes.get("pvb")),
        "nullVotes": int(votes.get("tvn") or 0), "nullPercent": number(votes.get("ptvn")),
        "finished": data.get("tf") == "s",
    }


def normalize_tracking(data, path):
    rows = []
    for item in data["abr"]:
        uf = item["cdabr"].lower()
        if uf not in STATE_NAMES:
            continue
        sections = item["s"]
        rows.append({"uf": uf.upper(), "name": STATE_NAMES[uf],
                     "sections": int(sections["st"]), "totalSections": int(sections["ts"]),
                     "percent": number(sections["pst"])})
    national = next(row for row in rows if row["uf"] == "BR")
    return {"national": national, "states": sorted((row for row in rows if row["uf"] != "BR"), key=lambda row: row["uf"]),
            "generated": f"{data.get('dg', '')} {data.get('hg', '')}".strip(), "source": BASE + path}


def load_tracking(elections):
    match = next(((cycle, election) for cycle, election in elections
                  if any(str(c["cd"]) == "1" for a in election.get("abr", []) for c in a.get("cp", []))), None)
    if not match:
        return {"error": "O acompanhamento nacional ainda nao foi publicado para este turno."}
    cycle, election = match
    code = str(election["cd"])
    path = f"{cycle}/{code}/dados/br/br-e{code.zfill(6)}-ab.json"
    try:
        return normalize_tracking(fetch_json(path), path)
    except HTTPError as error:
        error.close()
        return {"error": "O acompanhamento por estado esta indisponivel no TSE neste momento."}
    except (URLError, TimeoutError, OSError, ValueError, KeyError, TypeError, StopIteration):
        return {"error": "Nao foi possivel atualizar o acompanhamento por estado."}


def get_elections(turn):
    config = fetch_json("comum/config/ele-c.json", ttl=60)
    elections = []
    for pleito in config.get("pl", []):
        if pleito.get("c") != "ele2026":
            continue
        for election in pleito.get("e", []):
            if str(election.get("t")) == turn:
                elections.append((pleito["c"], election))
    return elections


def get_state_leaders(turn, uf):
    elections = get_elections(turn)
    match = next(((cycle, election) for cycle, election in elections
                  if any(str(c["cd"]) == "1" for a in election.get("abr", []) for c in a.get("cp", []))), None)
    if not match:
        return {"error": "O TSE ainda nao publicou presidente para este turno."}
    cycle, election = match
    code = str(election["cd"])
    path = f"{cycle}/{code}/dados/{uf}/{uf}-c0001-e{code.zfill(6)}-u.json"
    result = normalize(fetch_json(path, ttl=11), "1", cycle, code, uf, path)
    leaders = result["candidates"][:3] if any(c["votes"] > 0 for c in result["candidates"]) else []
    return {"uf": uf.upper(), "name": STATE_NAMES[uf], "turn": turn,
            "sectionPercent": result["sectionPercent"], "generated": result["generated"],
            "source": result["source"], "checkedAt": datetime.now(timezone.utc).isoformat(),
            "leaders": [{key: candidate[key] for key in ("number", "name", "party", "votes", "percent")}
                        for candidate in leaders]}


def get_results(turn, presidential_uf):
    elections = get_elections(turn)

    def load(cargo):
        uf = presidential_uf if cargo == "1" else "ce"
        match = next(((cycle, election) for cycle, election in elections
                      if any(str(c["cd"]) == cargo for a in election.get("abr", [])
                             for c in a.get("cp", []))), None)
        if not match:
            return {"id": cargo, "error": "Este cargo ainda nao tem dados publicados para este turno."}
        cycle, election = match
        code = str(election["cd"])
        path = f"{cycle}/{code}/dados/{uf}/{uf}-c{cargo.zfill(4)}-e{code.zfill(6)}-u.json"
        try:
            return normalize(fetch_json(path), cargo, cycle, code, uf, path)
        except HTTPError as error:
            message = "TSE ainda nao publicou dados para este cargo." if error.code == 404 else f"TSE respondeu HTTP {error.code}."
            error.close()
        except (URLError, TimeoutError, OSError):
            message = "Nao foi possivel consultar o TSE. Tentaremos novamente na proxima atualizacao."
        except (ValueError, KeyError, TypeError):
            message = "O formato dos dados do TSE mudou ou a resposta esta incompleta."
        return {"id": cargo, "error": message}

    with ThreadPoolExecutor(max_workers=6) as pool:
        tracking = pool.submit(load_tracking, elections)
        results = list(pool.map(load, CARGOS))
        overview = tracking.result()
    return {"checkedAt": datetime.now(timezone.utc).isoformat(), "turn": turn, "races": results, "overview": overview}


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        url = urlsplit(self.path)
        if url.path == "/api/state":
            params = parse_qs(url.query)
            turn = params.get("turn", ["1"])[0]
            uf = params.get("uf", [""])[0].lower()
            if turn not in ("1", "2") or uf not in STATE_NAMES or uf == "br":
                self.send_json({"error": "Parametros invalidos."}, 400)
                return
            try:
                self.send_json(get_state_leaders(turn, uf))
            except (HTTPError, URLError, TimeoutError, OSError, ValueError, KeyError, TypeError) as error:
                if isinstance(error, HTTPError):
                    error.close()
                self.send_json({"error": "Nao foi possivel consultar presidente neste estado. Tente novamente."}, 502)
        elif url.path == "/api/results":
            params = parse_qs(url.query)
            turn = params.get("turn", ["1"])[0]
            uf = params.get("president", ["br"])[0]
            if turn not in ("1", "2") or uf not in ("br", "ce"):
                self.send_json({"error": "Parametros invalidos."}, 400)
                return
            try:
                self.send_json(get_results(turn, uf))
            except (HTTPError, URLError, TimeoutError, OSError, ValueError, KeyError, TypeError) as error:
                if isinstance(error, HTTPError):
                    error.close()
                self.send_json({"error": "Nao foi possivel obter o catalogo de eleicoes do TSE. Verifique sua conexao e tente novamente."}, 502)
        elif url.path in ("/", "/index.html", "/app.js", "/style.css", "/geography.js", "/tse-client.js", "/d3.min.js", "/brasil-uf.geojson"):
            super().do_GET()
        else:
            self.send_error(404)

    def send_json(self, data, status=200):
        payload = json.dumps(data, ensure_ascii=True).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, fmt, *args):
        if args and str(args[0]).startswith("GET /api"):
            return
        super().log_message(fmt, *args)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--open", action="store_true")
    args = parser.parse_args()
    for port in range(args.port, args.port + 20):
        try:
            server = ThreadingHTTPServer(("127.0.0.1", port), partial(Handler, directory=str(ROOT)))
            break
        except OSError:
            continue
    else:
        raise SystemExit("Nenhuma porta livre encontrada.")
    address = f"http://127.0.0.1:{port}"
    print(f"Apuracao local: {address}\nPara encerrar, pressione Ctrl+C.", flush=True)
    if args.open:
        webbrowser.open(address)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
