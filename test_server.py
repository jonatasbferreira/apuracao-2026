import unittest
from unittest.mock import patch
from urllib.error import HTTPError

import server


def fixture():
    return {
        "dg": "04/10/2026", "hg": "17:30:00", "tf": "n",
        "s": {"ts": "100", "st": "25", "pst": "25,00"},
        "v": {"tv": "400", "vb": "40", "pvb": "10,00", "tvn": "20", "ptvn": "5,00"},
        "carg": [{"cd": "6", "agr": [{"par": [
            {"sg": "A", "cand": [
                {"n": "1001", "nmu": "B", "vap": "170", "pvap": "50,00", "sqcand": "123"},
                {"n": "1002", "nmu": "D", "vap": "0", "pvap": "0,00"}]},
            {"sg": "B", "cand": [
                {"n": "2001", "nmu": "A", "vap": "170", "pvap": "50,00"}]}]}]}],
    }


class ResultsTests(unittest.TestCase):
    def normalize(self, data):
        return server.normalize(data, "6", "ele2026", "6259", "ce", "sample.json")

    def test_nested_parties_ranking_and_percentages(self):
        result = self.normalize(fixture())
        self.assertEqual([c["number"] for c in result["candidates"]], ["2001", "1001", "1002"])
        self.assertEqual([c["rank"] for c in result["candidates"]], [1, 1, None])
        self.assertEqual(result["candidates"][1]["party"], "A")
        self.assertEqual(result["candidates"][1]["percent"], 50.0)
        self.assertEqual(result["whiteVotes"], 40)
        self.assertEqual(result["whitePercent"], 10.0)
        self.assertEqual(result["nullVotes"], 20)
        self.assertEqual(result["sectionPercent"], 25.0)
        self.assertEqual(result["sections"], 25)

    def test_zero_votes_do_not_claim_a_leader(self):
        data = fixture()
        for party in data["carg"][0]["agr"][0]["par"]:
            for candidate in party["cand"]:
                candidate["vap"] = "0"
        self.assertTrue(all(c["rank"] is None for c in self.normalize(data)["candidates"]))

    def test_catalog_resolves_codes_and_isolates_failed_cargo(self):
        config = {"pl": [{"c": "ele2026", "e": [{"cd": "9999", "t": "1", "abr": [{"cp": [{"cd": "6"}]}]}]}]}
        paths = []

        def fetch(path, ttl=8):
            paths.append(path)
            if path == "comum/config/ele-c.json":
                return config
            return fixture()

        with patch.object(server, "fetch_json", side_effect=fetch):
            result = server.get_results("1", "br")
        self.assertIn("ele2026/9999/dados/ce/ce-c0006-e009999-u.json", paths)
        self.assertEqual(next(r for r in result["races"] if r["id"] == "6")["whiteVotes"], 40)
        self.assertTrue(all("error" in r for r in result["races"] if r["id"] != "6"))

    def test_unpublished_result_is_reported_as_unavailable(self):
        config = {"pl": [{"c": "ele2026", "e": [{"cd": "6259", "t": "1", "abr": [{"cp": [{"cd": "6"}]}]}]}]}

        def fetch(path, ttl=8):
            if path == "comum/config/ele-c.json":
                return config
            raise HTTPError("https://resultados.tse.jus.br/", 404, "Not found", {}, None)

        with patch.object(server, "fetch_json", side_effect=fetch):
            result = server.get_results("1", "br")
        race = next(r for r in result["races"] if r["id"] == "6")
        self.assertIn("ainda nao publicou", race["error"])
        self.assertNotIn("candidates", race)

    def test_tracking_uses_official_national_total_and_totalized_percent(self):
        data = {"dg": "04/10/2026", "hg": "17:30:00", "abr": [
            {"cdabr": "ce", "s": {"st": "25", "ts": "1000", "pst": "2,50", "psa": "100,00"}},
            {"cdabr": "zz", "s": {"st": "10", "ts": "20", "pst": "50,00"}},
            {"cdabr": "br", "s": {"st": "150", "ts": "2000", "pst": "7,50"}},
        ]}
        result = server.normalize_tracking(data, "tracking.json")
        self.assertEqual(result["national"]["sections"], 150)
        self.assertEqual(result["national"]["percent"], 7.5)
        self.assertEqual([r["uf"] for r in result["states"]], ["CE", "ZZ"])
        self.assertEqual(result["states"][0]["percent"], 2.5)
        self.assertEqual(result["states"][1]["name"], "Exterior")

    def test_tracking_always_requests_brazil_even_with_ce_president(self):
        election = {"cd": "6257", "t": "1", "abr": [{"cp": [{"cd": "1"}]}]}
        config = {"pl": [{"c": "ele2026", "e": [election]}]}
        tracking = {"abr": [{"cdabr": "br", "s": {"st": "0", "ts": "100", "pst": "0,00"}}]}
        paths = []

        def fetch(path, ttl=8):
            paths.append(path)
            if path == "comum/config/ele-c.json":
                return config
            if path.endswith("-ab.json"):
                return tracking
            return fixture()

        with patch.object(server, "fetch_json", side_effect=fetch):
            result = server.get_results("1", "ce")
        self.assertIn("ele2026/6257/dados/br/br-e006257-ab.json", paths)
        self.assertIn("ele2026/6257/dados/ce/ce-c0001-e006257-u.json", paths)
        self.assertEqual(result["overview"]["national"]["uf"], "BR")

    def test_state_preview_returns_only_three_leaders_without_photos(self):
        config = {"pl": [{"c": "ele2026", "e": [{"cd": "6257", "t": "1", "abr": [{"cp": [{"cd": "1"}]}]}]}]}
        data = fixture()
        data["carg"][0]["cd"] = "1"
        data["carg"][0]["agr"][0]["par"][0]["cand"].extend([
            {"n": "30", "nmu": "C", "vap": "10", "pvap": "2,00"},
            {"n": "40", "nmu": "E", "vap": "5", "pvap": "1,00"},
        ])

        def fetch(path, ttl=8):
            return config if path == "comum/config/ele-c.json" else data

        with patch.object(server, "fetch_json", side_effect=fetch) as request:
            result = server.get_state_leaders("1", "ce")
        self.assertEqual([c["votes"] for c in result["leaders"]], [170, 170, 10])
        self.assertTrue(all("photo" not in candidate for candidate in result["leaders"]))
        self.assertEqual(result["uf"], "CE")
        self.assertEqual(result["sectionPercent"], 25.0)
        request.assert_any_call("ele2026/6257/dados/ce/ce-c0001-e006257-u.json", ttl=11)


if __name__ == "__main__":
    unittest.main()
