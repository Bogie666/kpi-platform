#!/usr/bin/env python3
"""Polish demo fixtures: fill remaining zero/empty data points with plausible,
internally-consistent synthetic values so every dashboard panel looks complete.
Run after capture-demo-fixtures.ts:  python3 scripts/polish_demo_fixtures.py
Deterministic — no RNG without a fixed seed."""
import json, math, hashlib

PATH = "src/demo-fixtures/index.json"
d = json.load(open(PATH))

PRESETS = ["today","l7","mtd","qtd","ytd","l30","l90","ttm","last_month"]

def h(s, lo, hi):
    """Deterministic pseudo-random in [lo,hi) from a string."""
    x = int(hashlib.md5(s.encode()).hexdigest()[:8], 16) / 0xFFFFFFFF
    return lo + x * (hi - lo)

# Monthly seasonality factor for an HVAC-ish business (summer peak).
SEASON = {1:0.82, 2:0.84, 3:0.92, 4:1.00, 5:1.08, 6:1.22, 7:1.30, 8:1.26, 9:1.05, 10:0.94, 11:0.86, 12:0.88}

def weekday_factor(date):
    import datetime
    y,m,dd = map(int, date.split("-"))
    wd = datetime.date(y,m,dd).weekday()
    return 0.42 if wd == 6 else (0.62 if wd == 5 else 1.0)

# ── 1. FINANCIAL: trend is a CUMULATIVE pacing curve. If any day is zero,
#     the window extends beyond the April seed — rebuild the entire curve
#     synthetically (deterministic) so it is smooth and monotonic.
_mtd_trend = d["financial__mtd"]["data"]["trend"]
_mtd_nz = [t for t in _mtd_trend if t["actual"] > 0]
REF_DAILY = (_mtd_nz[-1]["actual"]/len(_mtd_nz)) if _mtd_nz else 14_000_000

def rebuild_cumulative(trend, key):
    run_a = run_ly = run_l2 = run_tg = 0
    for t in trend:
        m = int(t["date"].split("-")[1])
        f = SEASON[m] * weekday_factor(t["date"]) * h(key+t["date"], 0.82, 1.18)
        inc = REF_DAILY * f
        run_a += int(inc)
        run_ly += int(inc * 0.872 * h(key+t["date"]+"y", 0.95, 1.05))
        run_l2 += int(inc * 0.762 * h(key+t["date"]+"z", 0.95, 1.05))
        run_tg += int(REF_DAILY * SEASON[m] * 0.97)
        t["actual"], t["ly"], t["ly2"], t["target"] = run_a, run_ly, run_l2, run_tg
    return trend

for p in PRESETS:
    k = f"financial__{p}"
    v = d[k]["data"]
    trend = v["trend"]
    if any(t["actual"] == 0 for t in trend):
        rebuild_cumulative(trend, k)
        v["total"]["revenue"]["value"] = trend[-1]["actual"]
        v["total"]["revenue"]["ly"] = trend[-1]["ly"]
        v["total"]["revenue"]["ly2"] = trend[-1]["ly2"]
    tot = v["total"]
    tot_a = tot["revenue"]["value"]
    if not tot["revenue"].get("ly"): tot["revenue"]["ly"] = int(tot_a * 0.872)
    if not tot["revenue"].get("ly2"): tot["revenue"]["ly2"] = int(tot_a * 0.762)
    # ALWAYS recompute target so pacing lands in a believable 95-106% band
    tot["target"] = int(tot_a / h(k+"goal", 0.95, 1.06)) or 1
    tot["fullPeriodTarget"] = max(tot.get("fullPeriodTarget") or 0, tot["target"])
    tot["percentToGoal"] = int(tot_a / tot["target"] * 10000)
    today = tot.get("today")
    if today:
        if today.get("revenue", 0) == 0:
            today["revenue"] = int(REF_DAILY * 0.62)
        today["target"] = int(today["revenue"] / h(k+"tdg", 0.55, 0.72))
        today["percentToGoal"] = int(today["revenue"] / today["target"] * 10000)
    # departments: fill zero revenue rows from MTD share, rescale to window total
    mtd_depts = d["financial__mtd"]["data"].get("departments", [])
    mtd_total = sum(x["revenue"]["value"] for x in mtd_depts) or 1
    mtd_share = {x["code"]: x["revenue"]["value"]/mtd_total for x in mtd_depts}
    # empty list (window predates seed) → clone MTD departments scaled to this total
    if not v.get("departments") and mtd_depts:
        import copy
        v["departments"] = copy.deepcopy(mtd_depts)
        for dept in v["departments"]:
            r = tot_a / (sum(x["revenue"]["value"] for x in mtd_depts) or 1)
            dept["revenue"]["value"] = int(dept["revenue"]["value"] * r * mtd_total / mtd_total)
            dept["revenue"]["value"] = int(mtd_share[dept["code"]] * tot_a)
            dept["revenue"]["ly"] = int(dept["revenue"]["value"] * h(k+dept["code"]+"ely", 0.85, 0.93))
            dept["revenue"]["ly2"] = int(dept["revenue"]["ly"] * h(k+dept["code"]+"el2", 0.84, 0.93))
    dept_sum = sum(x["revenue"]["value"] for x in v.get("departments", []))
    scale = (tot_a / dept_sum) if dept_sum else None
    for dept in v.get("departments", []):
        share = mtd_share.get(dept["code"], 1.0/max(1, len(v["departments"])))
        if dept["revenue"]["value"] == 0:
            dept["revenue"]["value"] = int(tot_a * share)
            dept["jobs"] = dept["jobs"] or max(3, int(840 * share))
            dept["opportunities"] = dept["opportunities"] or int(dept["jobs"] * 2.2)
        elif scale and abs(scale - 1) > 0.15:
            dept["revenue"]["value"] = int(dept["revenue"]["value"] * scale)
            dept["jobs"] = max(dept["jobs"], int(dept["jobs"] * scale))
            dept["opportunities"] = max(dept["opportunities"], int(dept["opportunities"] * scale))
        if not dept["revenue"].get("ly"):
            dept["revenue"]["ly"] = int(dept["revenue"]["value"] * h(k+dept["code"]+"ly", 0.85, 0.93))
        elif scale and abs(scale - 1) > 0.15:
            dept["revenue"]["ly"] = int(dept["revenue"]["ly"] * scale)
        if not dept["revenue"].get("ly2"):
            dept["revenue"]["ly2"] = int(dept["revenue"]["ly"] * h(k+dept["code"]+"l2", 0.84, 0.93))
        elif scale and abs(scale - 1) > 0.15:
            dept["revenue"]["ly2"] = int(dept["revenue"]["ly2"] * scale)
        dept["target"] = int(dept["revenue"]["value"] / h(k+dept["code"], 0.93, 1.06))
        for spark_key in ("spark", "lySpark"):
            sp = dept.get(spark_key) or []
            nzs = [x for x in sp if x > 0]
            if sp and not nzs:
                base = dept["revenue"]["value"] / max(1, len(sp))
                dept[spark_key] = [int(base * h(k+dept["code"]+spark_key+str(i), 0.75, 1.25)) for i in range(len(sp))]
            elif sp and len(nzs) < len(sp):
                ms = sum(nzs)/len(nzs)
                dept[spark_key] = [x if x > 0 else int(ms * h(k+dept["code"]+spark_key+str(i), 0.8, 1.2)) for i, x in enumerate(sp)]
    # fill kpi zeros
    kp = v.get("kpis", {})
    base = {"closeRate": 4791, "avgTicket": 211603, "opportunities": 1747, "memberships": 8358}
    for name, cmpv in kp.items():
        b = base.get(name, 100)
        if cmpv.get("value", 0) == 0: cmpv["value"] = int(b * h(k+name, 0.95, 1.05))
        if cmpv.get("ly", 0) == 0: cmpv["ly"] = int(cmpv["value"] * h(k+name+"ly", 0.88, 0.96))
        if cmpv.get("ly2", 0) == 0: cmpv["ly2"] = int(cmpv["ly"] * h(k+name+"l2", 0.86, 0.95))

# ── 2. ESTIMATES: tier selection + seasonality backfill ─────────────────────
ttm_season = d["estimates__ttm"]["data"]["seasonality"]
season_by_month = {s["month"]: s for s in ttm_season if s["closeRateBps"] > 0}
for p in PRESETS:
    v = d[f"estimates__{p}"]["data"]
    # tiers: distribute won jobs 21/52/27
    won = sum(x["count"] for x in v.get("timeToClose", []))
    if won == 0:
        won = max(40, int(v["totals"]["opportunities"] * 0.44))
    tiers = v.get("tierSelection", [])
    if tiers and all(t["count"] == 0 for t in tiers):
        split = {"low": 0.21, "mid": 0.52, "high": 0.27}
        for t in tiers:
            t["count"] = int(won * split[t["tier"]])
            t["pct"] = int(split[t["tier"]] * 100)
    for s in v.get("seasonality", []):
        if s["closeRateBps"] == 0:
            ref = season_by_month.get(s["month"])
            if ref:
                s["closeRateBps"] = ref["closeRateBps"]
                s["avgTicketCents"] = ref["avgTicketCents"]
            else:
                s["closeRateBps"] = int(h("est"+p+s["month"], 3900, 4900))
                s["avgTicketCents"] = int(h("estt"+p+s["month"], 180000, 235000))

# ── 3. PIPELINE REVENUE: populate booked-work pipeline ──────────────────────
PIPE_SPLIT = {"hvac_service": 0.24, "hvac_sales": 0.38, "hvac_maintenance": 0.05,
              "commercial": 0.14, "plumbing": 0.12, "electrical": 0.07}
for p in PRESETS:
    v = d[f"pipeline-revenue__{p}"]["data"]
    if v.get("totalCents", 0) == 0:
        total = int(h("pipe"+p, 58_000_000, 74_000_000))
        v["totalCents"] = total
        v["jobsWithEstimate"] = int(h("pipej"+p, 34, 48))
        v["appointmentsConsidered"] = max(v.get("appointmentsConsidered", 0), int(h("pipea"+p, 55, 75)))
        v["byDivision"] = {code: int(total * share) for code, share in PIPE_SPLIT.items()}

# ── 4. MEMBERSHIPS: LY2 + history last point ────────────────────────────────
for p in PRESETS:
    v = d[f"memberships__{p}"]["data"]
    ly2 = v.get("ly2", {})
    if ly2.get("active", 0) == 0:
        ly2["active"] = 6608
        ly2["newMonth"] = 158
        ly2["churnMonth"] = 61
        ly2["netMonth"] = 97
    hist = v.get("history", [])
    if hist and hist[-1] == 0:
        hist[-1] = 8412
    for i, x in enumerate(hist):
        if x == 0:
            hist[i] = hist[i-1] if i else 7200

# ── 5. TECHNICIANS: sparklines for every tech entry ─────────────────────────
for key in list(d.keys()):
    if not key.startswith("technicians__"):
        continue
    v = d[key]["data"]
    for t in v.get("technicians", []):
        if not t.get("spark"):
            base = h(key + t["name"], 20, 60)
            slope = h(key + t["name"] + "s", -1.5, 4.0)
            t["spark"] = [max(4, int(base + slope * i + h(key+t["name"]+str(i), -6, 6))) for i in range(10)]
        if not t.get("lySpark"):
            t["lySpark"] = [max(3, int(x * h(key+t["name"]+"ly"+str(i), 0.75, 0.95))) for i, x in enumerate(t["spark"])]

# ── 6. CALL CENTER: hourly curve for non-today windows ──────────────────────
HOURLY = [("6a",4,2),("7a",12,8),("8a",22,15),("9a",28,21),("10a",31,22),
          ("11a",29,20),("12p",24,16),("1p",26,18),("2p",18,12),("3p",14,9)]
for p in PRESETS:
    v = d[f"callcenter__{p}"]["data"]
    if not v.get("hourly"):
        v["hourly"] = [{"hr": hr, "calls": c, "booked": b,
                        "lyCalls": max(1, int(c*0.85)), "lyBooked": max(1, int(b*0.82))}
                       for hr, c, b in HOURLY]

# ── 7. DAILY TARGETS: today schedule + backlog ──────────────────────────────
for p in PRESETS:
    v = d[f"daily-targets__{p}"]["data"]
    tot_jobs = 0
    tot_backlog = 0
    for div in v.get("divisions", []):
        blended = (div.get("trailing") or {}).get("blended") or {}
        daily_jobs = max(2, int((blended.get("jobs") or 60) / 30))
        code = div["code"]
        sched = div.get("todaySchedule") or {}
        if sched.get("total", 0) == 0:
            demand = max(1, int(daily_jobs * h("dt"+p+code, 0.5, 0.7)))
            install = max(0, int(daily_jobs * h("dti"+p+code, 0.1, 0.25)))
            maint = max(0, daily_jobs - demand - install)
            div["todaySchedule"] = {"total": demand+install+maint, "demand": demand,
                                    "install": install, "maintenance": maint}
        tot_jobs += div["todaySchedule"]["total"]
        if div.get("backlogCents", 0) == 0:
            div["backlogCents"] = int((div.get("monthlyBudgetCents") or 10_000_000) * h("dtb"+p+code, 0.06, 0.14))
        tot_backlog += div["backlogCents"]
        if div.get("demandCallsBooked", 0) == 0:
            div["demandCallsBooked"] = div["todaySchedule"]["demand"]
        if div.get("maintScheduledToday", 0) == 0:
            div["maintScheduledToday"] = div["todaySchedule"]["maintenance"]
        if div.get("todayRevenueCents", 0) == 0:
            div["todayRevenueCents"] = int((div.get("revenuePerJobCents") or 300000) * div["todaySchedule"]["total"] * 0.62)
    t = v.get("totals", {})
    if t.get("jobsScheduledToday", 0) == 0:
        t["jobsScheduledToday"] = tot_jobs
    if t.get("backlogCents", 0) == 0:
        t["backlogCents"] = tot_backlog

# ── 8. TOP PERFORMERS: sparklines on podium entries ─────────────────────────
for p in PRESETS:
    v = d[f"top-performers__{p}"]["data"]
    for rolegrp in v.get("byRole", []):
        for t in rolegrp.get("top", []):
            if not t.get("spark"):
                base = h("tp"+p+t["name"], 22, 58)
                slope = h("tp"+p+t["name"]+"s", -1.0, 4.0)
                t["spark"] = [max(4, int(base + slope*i + h("tp"+p+t["name"]+str(i), -5, 5))) for i in range(10)]
            if not t.get("lySpark"):
                t["lySpark"] = [max(3, int(x * h("tp"+p+t["name"]+"ly"+str(i), 0.75, 0.95))) for i, x in enumerate(t["spark"])]

# ── 9. REVIEWS: full synthetic review set (214 reviews, 4.9★) ───────────────
import datetime as _dt
_names = ["Karen W.","Miguel T.","Dana R.","Chris P.","Ashley M.","Robert L.","Tina S.","Jordan K.","Beth H.","Sam O.",
          "Vic N.","Paula G.","Derek F.","Lisa C.","Aaron B.","Monica J.","Terry D.","Nina V.","Owen S.","Grace L."]
_texts5 = [
    "Marcus was on time, explained everything, and had our AC running the same day. Outstanding service.",
    "Jenna diagnosed the issue in minutes and gave us a fair price. Couldn't ask for more.",
    "Fast scheduling, clean work, and they walked me through the invoice line by line.",
    "Second time using them — same great experience. Tech wore shoe covers and cleaned up after.",
    "Called at 8am, fixed by noon. Pricing was upfront with zero surprises.",
    "The technician was courteous and thorough. Our new system works perfectly.",
    "Great communication from booking to arrival. Highly recommend.",
    "Professional crew, quality install, and they hauled everything away.",
]
_texts4 = ["Good service overall, just wished for an earlier arrival window.",
           "Solid work and fair price. Scheduling took a day longer than hoped."]
_locs = [("loc-north", "Summit Air & Plumbing — North"), ("loc-south", "Summit Air & Plumbing — South")]
_months = []
_y, _m = 2025, 5
for _ in range(12):
    _months.append(f"{_y:04d}-{_m:02d}")
    _m += 1
    if _m > 12: _m = 1; _y += 1
_counts = [14,15,16,17,18,18,19,19,20,20,19,19]
_trend = [{"month": mo, "count": c, "avgRating": round(4.7 + h("rv"+mo, 0, 0.3), 2)} for mo, c in zip(_months, _counts)]
_recent = []
_base = _dt.datetime(2026, 4, 21)
for i in range(20):
    rating = 4 if i in (7, 15) else 5
    txt = _texts4[i % 2] if rating == 4 else _texts5[i % len(_texts5)]
    loc = _locs[i % 2]
    dt = _base - _dt.timedelta(days=i*2 + int(h("rvd"+str(i), 0, 2)))
    _recent.append({"id": f"demo-rev-{i+1}", "name": _names[i], "rating": rating, "text": txt,
                    "reply": "Thank you for trusting our team — we appreciate you!" if i % 3 == 0 else None,
                    "locationId": loc[0], "locationName": loc[1],
                    "date": dt.strftime("%Y-%m-%dT%H:%M:%S.000Z")})
d["reviews"] = {"data": {
    "total": 214, "avgRating": 4.9,
    "ratingDist": {"1": 2, "2": 1, "3": 3, "4": 12, "5": 196},
    "trend": _trend, "recent": _recent,
    "byLocation": [
        {"id": "loc-north", "name": _locs[0][1], "count": 118, "avgRating": 4.9, "reportedTotal": 126},
        {"id": "loc-south", "name": _locs[1][1], "count": 96, "avgRating": 4.88, "reportedTotal": 103},
    ],
    "lastSync": {"at": "2026-04-21T14:30:00.000Z", "status": "completed", "totalSynced": 214, "error": None},
}}

json.dump(d, open(PATH, "w"), separators=(",", ":"))
print("polished", len(d), "fixtures")

# verification pass: report remaining heavy-zero fixtures
worst = []
for k in sorted(d.keys()):
    s = json.dumps(d[k])
    zc = s.count(":0,") + s.count(":0}")
    if zc > 12:
        worst.append((k, zc))
for k, z in worst[:20]:
    print("still-zeroish:", k, z)
