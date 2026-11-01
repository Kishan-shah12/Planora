"""Unit tests for vendor checklist generation across all three event domains."""
from app.vendor_engine import build_vendor_groups


def test_wedding_vendor_groups():
    """Weddings include venue, catering, photography, attire, florals, and logistics."""
    groups = build_vendor_groups("wedding")
    group_names = [g.vendor for g in groups]
    assert "Venue & Hospitality" in group_names
    assert "Catering & Dining" in group_names
    assert "Photography & Cinematography" in group_names
    assert "Attire, Styling & Beauty" in group_names
    assert "Decor, Florals & Ambience" in group_names
    assert "Guest Logistics & Transport" in group_names

    task_ids = set()
    for g in groups:
        assert len(g.tasks) > 0
        for t in g.tasks:
            assert t.id not in task_ids, f"Duplicate task ID: {t.id}"
            task_ids.add(t.id)
            assert t.title
            assert t.description
            assert t.priority in ("high", "medium", "low")


def test_birthday_vendor_groups():
    """Birthdays include party hall, custom cake, entertainment host, decor, and favors."""
    groups = build_vendor_groups("birthday")
    group_names = [g.vendor for g in groups]
    assert "Venue & Party Space" in group_names
    assert "Custom Cake & Refreshments" in group_names
    assert "Entertainment & Activities" in group_names
    assert "Decor, Balloons & Favors" in group_names
    assert "Photography & Memories" in group_names


def test_community_vendor_groups():
    """Community celebrations include civic permits, inclusivity/safety, sound/AV, and volunteer coordination."""
    groups = build_vendor_groups("community")
    group_names = [g.vendor for g in groups]
    assert "Venue, Civic Permissions & Licensing" in group_names
    assert "Inclusivity, Safety & First Aid" in group_names
    assert "Sound, AV & Stage Infrastructure" in group_names
    assert "Volunteer Coordination & Hospitality" in group_names
    assert "Publicity & Signage" in group_names

    # Check for specific community requirements
    all_tasks = [t.title.lower() for g in groups for t in g.tasks]
    assert any("permission" in title or "noc" in title for title in all_tasks)
    assert any("wheelchair" in title or "step-free" in title for title in all_tasks)
    assert any("first aid" in title for title in all_tasks)
    assert any("volunteer" in title for title in all_tasks)
