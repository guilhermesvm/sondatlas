from ripe_atlas_tcc.probe_state import load_selected_probe, save_selected_probe


def test_selected_probe_is_saved_and_loaded(tmp_path):
    state_path = tmp_path / "state" / "probe.json"

    save_selected_probe(state_path, 1018246)

    assert load_selected_probe(state_path) == 1018246
    assert not (tmp_path / "state" / ".probe.json.tmp").exists()


def test_missing_probe_state_means_no_probe_selected(tmp_path):
    assert load_selected_probe(tmp_path / "probe.json") is None
