# @req FR-09 — render plan builder: project dict -> RenderPlan (บริสุทธิ์ ไม่แตะเสียง)
import pytest


def _clip(**kw):
    base = {"id": "c1", "assetId": "a_1", "start": 0.0, "duration": 2.0,
            "offset": 0.0, "gain": 1.0, "muted": False, "color": "#fff"}
    base.update(kw)
    return base


def _track(clips, **kw):
    base = {"id": "t1", "label": "T", "color": "#fff", "pan": 0.0,
            "muted": False, "solo": False, "locked": False, "envelopes": []}
    base.update(kw)
    base["clips"] = clips
    return base


def _project(tracks, assets=None):
    return {
        "bpm": 120, "key": None, "timeSig": 4, "loop": None, "duration": 0,
        "assets": assets if assets is not None else {"a_1": {"id": "a_1", "kind": "upload", "name": "song.wav"}},
        "tracks": tracks,
    }


@pytest.fixture()
def song(data_dir):
    """สร้างไฟล์จริงใน uploads/ ให้ resolve_asset หาเจอ"""
    p = data_dir / "uploads" / "song.wav"
    p.write_bytes(b"RIFF" + b"\0" * 40)
    return p


def test_plan_resolves_clip_to_a_real_path(song, data_dir):
    from app.pipelines.render import build_render_plan

    plan = build_render_plan(_project([_track([_clip()])]))
    assert len(plan.tracks) == 1
    assert plan.tracks[0].clips[0].path == str(song)


def test_plan_duration_is_the_last_clip_end(song):
    from app.pipelines.render import build_render_plan

    plan = build_render_plan(_project([_track([_clip(start=1.5, duration=2.0)])]))
    assert plan.duration == pytest.approx(3.5)


def test_muted_clip_is_dropped(song):
    """clip muted -> track ที่เหลือ clip=0 ก็ถูกตัดทิ้งทั้งแทร็ก (เหมือน no-asset/all-muted อื่น ๆ)
    ไม่มี track ว่างเปล่าไหนมีประโยชน์ต่อ mixer — ไม่มีอะไรให้ decode/sum"""
    from app.pipelines.render import build_render_plan

    plan = build_render_plan(_project([_track([_clip(muted=True)])]))
    assert plan.tracks == []


def test_muted_track_is_dropped(song):
    from app.pipelines.render import build_render_plan

    plan = build_render_plan(_project([_track([_clip()], muted=True)]))
    assert plan.tracks == []


def test_solo_excludes_every_non_solo_track(song):
    from app.pipelines.render import build_render_plan

    plan = build_render_plan(_project([
        _track([_clip()], id="a", solo=False),
        _track([_clip()], id="b", solo=True),
    ]))
    assert len(plan.tracks) == 1
    assert plan.tracks[0].pan == 0.0


def test_pan_is_carried_and_clamped(song):
    from app.pipelines.render import build_render_plan

    plan = build_render_plan(_project([_track([_clip()], pan=-3.0)]))
    assert plan.tracks[0].pan == -1.0


def test_clip_without_an_asset_is_dropped(song):
    from app.pipelines.render import build_render_plan

    plan = build_render_plan(_project([_track([_clip(assetId=None)])]))
    assert plan.tracks == []


def test_missing_media_raises_a_named_error(data_dir):
    from app.pipelines.render import build_render_plan, MissingAssetError

    with pytest.raises(MissingAssetError) as exc:
        build_render_plan(_project([_track([_clip()])]))
    assert "song.wav" in str(exc.value)


def test_overlapping_fades_are_clamped_to_the_clip_length(song):
    from app.pipelines.render import build_render_plan

    plan = build_render_plan(_project([_track([_clip(duration=2.0, fadeIn=1.5, fadeOut=1.5)])]))
    c = plan.tracks[0].clips[0]
    assert c.fade_in + c.fade_out == pytest.approx(2.0)
    assert c.fade_in == pytest.approx(1.0)


def test_track_with_one_muted_and_one_playable_clip_keeps_only_the_playable_one(song):
    from app.pipelines.render import build_render_plan

    plan = build_render_plan(_project([_track([
        _clip(id="c1", muted=True), _clip(id="c2", start=3.0, muted=False),
    ])]))
    assert len(plan.tracks) == 1
    assert len(plan.tracks[0].clips) == 1
    assert plan.tracks[0].clips[0].start == pytest.approx(3.0)


def test_empty_project_yields_an_empty_plan(data_dir):
    from app.pipelines.render import build_render_plan

    plan = build_render_plan(_project([]))
    assert plan.tracks == []
    assert plan.duration == 0.0
