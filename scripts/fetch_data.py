#!/usr/bin/env python3
"""
첫 글자 도감 - 데이터 수집 스크립트

PokeAPI에서 포켓몬 정보를 받아 data/pokemon-data.js 파일을 만든다.
새 포켓몬이 추가되면 이 스크립트를 다시 실행하기만 하면 된다.

    python3 scripts/fetch_data.py

- 파이썬 기본 기능만 사용한다(추가 설치 없음).
- 동시 요청은 MAX_WORKERS개로 제한하고, 실패한 요청은 RETRIES번까지 재시도한다.
- 전체 포켓몬 수는 API가 알려주는 값을 사용한다.
- data/overrides.json 의 수동 보정 값이 API 값보다 우선한다.
"""

import json
import os
import random
import sys
import time
import unicodedata
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

API = "https://pokeapi.co/api/v2"
ARTWORK_BASE = (
    "https://raw.githubusercontent.com/PokeAPI/sprites/master/"
    "sprites/pokemon/other/official-artwork/"
)
MAX_WORKERS = 8
RETRIES = 5

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(ROOT, "data")
OUT_FILE = os.path.join(DATA_DIR, "pokemon-data.js")
OVERRIDES_FILE = os.path.join(DATA_DIR, "overrides.json")

REGIONS = ("alola", "galar", "hisui", "paldea")


# ---------------------------------------------------------------- 네트워크

def get_json(url):
    """URL에서 JSON을 받아온다. 실패하면 점점 오래 기다리며 재시도한다."""
    last_error = None
    for attempt in range(RETRIES):
        try:
            req = urllib.request.Request(
                url, headers={"User-Agent": "first-letter-pokedex/1.0"}
            )
            with urllib.request.urlopen(req, timeout=30) as res:
                return json.loads(res.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 404:
                raise
            last_error = e
        except Exception as e:  # 연결 끊김, 시간 초과 등
            last_error = e
        time.sleep(1.5 * (2 ** attempt))
    raise RuntimeError("요청 실패 ({}회 시도): {} - {}".format(RETRIES, url, last_error))


def fetch_all(urls, label):
    """여러 URL을 동시에(최대 MAX_WORKERS개) 받아온다. 진행 상황을 출력한다."""
    results = {}
    done = 0
    total = len(urls)

    def work(url):
        return url, get_json(url)

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        for url, data in pool.map(work, urls):
            results[url] = data
            done += 1
            if done % 100 == 0 or done == total:
                print("  {} {}/{}".format(label, done, total), flush=True)
    return results


# ---------------------------------------------------------------- 가공 도우미

def nfc(text):
    return unicodedata.normalize("NFC", text) if text else text


def pick_lang(entries, lang, key="name"):
    for entry in entries:
        if entry["language"]["name"] == lang:
            return nfc(entry[key])
    return ""


def clean_flavor(text):
    for ch in ("\n", "\f", "\r", "­"):
        text = text.replace(ch, " ")
    return nfc(" ".join(text.split()))


def latest_flavor(species):
    """한국어 도감 설명 중 가장 최근 게임의 것을 고른다."""
    entries = [
        e["flavor_text"]
        for e in species["flavor_text_entries"]
        if e["language"]["name"] == "ko"
    ]
    return clean_flavor(entries[-1]) if entries else ""


def artwork_file(pokemon):
    url = pokemon["sprites"]["other"]["official-artwork"]["front_default"]
    if not url:
        return ""
    return url[len(ARTWORK_BASE):] if url.startswith(ARTWORK_BASE) else url


def id_from_url(url):
    return int(url.rstrip("/").split("/")[-1])


def form_kind(form):
    name = form["form_name"]
    if form["is_mega"]:
        return "mega"
    if "gmax" in name:
        return "gmax"
    if any(region in name for region in REGIONS):
        return "regional"
    return "other"


def body_info(pokemon):
    return {
        "types": [t["type"]["name"] for t in pokemon["types"]],
        "height": pokemon["height"] / 10,  # 데시미터 -> m
        "weight": pokemon["weight"] / 10,  # 헥토그램 -> kg
        "art": artwork_file(pokemon),
    }


# ---------------------------------------------------------------- 본 작업

def main():
    print("1/4 전체 포켓몬 수 확인")
    total = get_json(API + "/pokemon-species?limit=1")["count"]
    listing = get_json("{}/pokemon-species?limit={}".format(API, total))["results"]
    species_urls = sorted((r["url"] for r in listing), key=id_from_url)
    print("  API 기준 전국도감 {}마리".format(total))

    print("2/4 종(species) 정보 수집")
    species_map = fetch_all(species_urls, "species")

    print("3/4 포켓몬(모습) 정보 수집")
    pokemon_urls = []
    for url in species_urls:
        for v in species_map[url]["varieties"]:
            pokemon_urls.append(v["pokemon"]["url"])
    pokemon_map = fetch_all(pokemon_urls, "pokemon")

    form_urls = []
    for url in species_urls:
        for v in species_map[url]["varieties"]:
            if not v["is_default"]:
                form_urls.append(pokemon_map[v["pokemon"]["url"]]["forms"][0]["url"])
    print("4/4 특수 폼 이름 수집")
    form_map = fetch_all(form_urls, "form")

    overrides = load_overrides()
    form_overrides = overrides.get("forms", {})
    excluded = set(overrides.get("excludeForms", []))
    records = []
    skipped_forms = []

    for url in species_urls:
        sp = species_map[url]
        default_url = next(v for v in sp["varieties"] if v["is_default"])["pokemon"]["url"]
        rec = {
            "id": sp["id"],
            "name": pick_lang(sp["names"], "ko"),
            "nameEn": pick_lang(sp["names"], "en"),
            "genus": pick_lang(sp["genera"], "ko", key="genus"),
            "flavor": latest_flavor(sp),
            "gen": sp["generation"]["name"].replace("generation-", "").upper(),
        }
        rec.update(body_info(pokemon_map[default_url]))

        apply_override(rec, overrides.get("pokemon", {}))

        forms = []
        for v in sp["varieties"]:
            if v["is_default"]:
                continue
            pk = pokemon_map[v["pokemon"]["url"]]
            if pk["name"] in excluded:
                continue
            fm = form_map[pk["forms"][0]["url"]]
            label = nfc(form_overrides.get(pk["name"], "")) or (
                pick_lang(fm["form_names"], "ko") or pick_lang(fm["names"], "ko")
            )
            info = body_info(pk)
            if not label or not info["art"]:
                skipped_forms.append("{} ({})".format(pk["name"], "이름 없음" if not label else "그림 없음"))
                continue
            name = form_display_name(rec["name"], label)
            if any(f["name"] == name for f in forms):
                skipped_forms.append("{} (같은 이름 중복: {})".format(pk["name"], name))
                continue
            entry = {"key": pk["name"], "name": name, "kind": form_kind(fm)}
            entry.update(info)
            forms.append(entry)
        if forms:
            rec["forms"] = forms

        records.append(rec)

    write_output(records, total)
    report(records, skipped_forms, overrides)


def form_display_name(species_name, label):
    """공식 도감 표기 방식: '메가리자몽X'는 그대로, '알로라의 모습'은 '꼬렛 알로라의 모습'으로."""
    if label.startswith(("메가", "원시")):
        return label
    return "{} {}".format(species_name, label)


def load_overrides():
    if not os.path.exists(OVERRIDES_FILE):
        return {}
    with open(OVERRIDES_FILE, encoding="utf-8") as f:
        return json.load(f)


def apply_override(rec, overrides):
    fix = overrides.get(str(rec["id"]))
    if not fix:
        return
    for key, value in fix.items():
        if key.startswith("_"):
            continue
        rec[key] = nfc(value) if isinstance(value, str) else value


def write_output(records, total):
    os.makedirs(DATA_DIR, exist_ok=True)
    meta = {
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "total": total,
        "artworkBase": ARTWORK_BASE,
        "source": "PokeAPI (https://pokeapi.co)",
    }
    lines = [
        "// 자동 생성 파일입니다. 직접 수정하지 마세요.",
        "// 갱신: python3 scripts/fetch_data.py   /   이름 보정: data/overrides.json",
        "window.POKEDEX_META = " + json.dumps(meta, ensure_ascii=False) + ";",
        "window.POKEDEX = [",
    ]
    for rec in records:
        lines.append(json.dumps(rec, ensure_ascii=False, separators=(",", ":")) + ",")
    lines.append("];")
    with open(OUT_FILE, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    size_kb = os.path.getsize(OUT_FILE) / 1024
    print("\n저장 완료: data/pokemon-data.js ({}마리, {:.0f}KB)".format(len(records), size_kb))


def report(records, skipped_forms, overrides):
    print("\n================ 데이터 검증 ================")
    by_id = {r["id"]: r for r in records}

    def show_missing(title, key):
        missing = [r for r in records if not r.get(key)]
        print("- {}: {}마리".format(title, len(missing)))
        for r in missing:
            print("    No.{:04d} {} ({})".format(r["id"], r.get("name") or "?", r["nameEn"]))

    show_missing("한국어 이름이 비어 있는 포켓몬", "name")
    show_missing("한국어 분류가 비어 있는 포켓몬", "genus")
    show_missing("한국어 도감 설명이 비어 있는 포켓몬", "flavor")
    print("- 이름·그림이 없어 제외한 특수 폼: {}개".format(len(skipped_forms)))
    for s in skipped_forms:
        print("    " + s)
    print("- 포함된 특수 폼: {}개".format(sum(len(r.get("forms", [])) for r in records)))
    print("- 수동 보정: 포켓몬 {}건, 특수 폼 이름 {}건".format(
        len(overrides.get("pokemon", {})), len(overrides.get("forms", {}))))

    print("\n[샘플 대조]")
    # 공식 도감 확인 결과: 방패톱스는 No.0410, No.0411은 진화형 바리톱스
    expected = {1: "이상해씨", 25: "피카츄", 410: "방패톱스", 411: "바리톱스", 6: "리자몽"}
    for pid, name in expected.items():
        got = by_id[pid]["name"]
        mark = "일치" if got == name else "불일치!"
        print("  No.{:04d} 기대={} 실제={} -> {}".format(pid, name, got, mark))

    latest_gen = records[-1]["gen"]
    pool = [r for r in records if r["gen"] == latest_gen]
    print("\n[최신 세대({}) 무작위 5마리 - 공식 도감과 대조 필요]".format(latest_gen))
    for r in sorted(random.sample(pool, 5), key=lambda r: r["id"]):
        print("  No.{:04d} {} ({}) / {} / {}".format(
            r["id"], r["name"], r["nameEn"], r["genus"], ",".join(r["types"])))


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit("\n중단되었습니다.")
