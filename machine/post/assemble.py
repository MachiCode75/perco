"""Final assembly (ARCHITECTURE.md §11).

python3 post/assemble.py --episode episodes/<slug>/episode.json --timeline build/<slug>/timeline.json \
    --words build/<slug>/audio/words.json --shots build/<slug>/shots \
    --narration build/<slug>/audio/narration.wav --music build/<slug>/audio/music.wav --out out/<slug>.mp4
    [--force] [--crf 18] [--preset medium] [--music-rel -8] [--duck-db 4] [--no-contact]

Steps (logged with timings; any failure → non-zero exit):
 1. validate: every timeline shot has build/<slug>/shots/<id>.mp4, 720x1280 @ 30 fps, frame count ==
    timeline frames (|diff| <= 3 frames is repaired by trim / last-frame clone with a warning; larger
    → error unless --lenient), timeline ids == episode ids, sum(frames) == timeline total, narration
    not longer than the video;
 2. captions: build/<slug>/post/captions.ass (post/captions.py, reference style, 1080x1920);
 3. audio: narration → −16 LUFS; music looped/trimmed to the video, faded, set `--music-rel` LU under
    the voice and ducked `--duck-db` dB under speech (envelope follower on the narration, attack 80 ms,
    release 350 ms); look-ahead true-peak limiter; two-pass loudnorm → −14 LUFS, −1.5 dBTP target
    (≤ −1 dBTP after AAC);
 4. video, one ffmpeg graph: concat demuxer (frames re-stamped N/30, no drop/dup) → lanczos scale
    720x1280 → 1080x1920 (BT.601 → BT.709) → binocular mask overlay on `binoculars: true` shots
    (frame-exact ranges) → libass captions (assets/fonts) → H.264 High yuv420p CRF 18 preset medium,
    AAC 192 kb/s 44.1 kHz stereo, +faststart;
 5. verify output frame count == timeline total; write out/<slug>_contact.jpg.
Re-running with unchanged inputs/code is a no-op (stamp in build/<slug>/post/assemble.stamp).
"""
import argparse, hashlib, json, os, shutil, subprocess, sys, time

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(ROOT, "pipeline"))
import captions as CAP  # noqa: E402
import contact_sheet as CS  # noqa: E402
import text as T  # noqa: E402

MASK = os.path.join(ROOT, "assets", "jumelles_1080x1920.png")
SR = 44100
W_IN, H_IN, W_OUT, H_OUT = 720, 1280, 1080, 1920


class Fail(Exception):
    pass


T0 = time.time()


def log(msg):
    print(f"[post {time.time() - T0:6.1f}s] {msg}", flush=True)


def run(cmd, what, capture=False):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise Fail(f"{what} failed (exit {r.returncode}):\n  {' '.join(cmd)[:600]}\n{r.stderr[-3000:]}")
    return r


def esc(path):
    """Escape a path for use inside a filtergraph option value."""
    return path.replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'").replace(",", "\\,")


# ---------------------------------------------------------------------------------------------- validate
def probe_clip(path):
    r = run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-count_packets", "-show_entries",
             "stream=codec_name,width,height,r_frame_rate,pix_fmt,nb_read_packets,color_space",
             "-of", "json", path], f"ffprobe {path}")
    st = json.loads(r.stdout)["streams"]
    if not st:
        raise Fail(f"{path}: no video stream")
    s = st[0]
    num, den = (int(x) for x in s["r_frame_rate"].split("/"))
    return {"codec": s.get("codec_name"), "w": int(s["width"]), "h": int(s["height"]), "fps": num / den,
            "pix_fmt": s.get("pix_fmt"), "frames": int(s.get("nb_read_packets") or 0),
            "colorspace": s.get("color_space")}


def validate(a, ep, tl, wd, work):
    fps = int(tl.get("fps", 30))
    if fps != 30:
        raise Fail(f"timeline fps {fps} != 30")
    shots = tl["shots"]
    total = sum(s["frames"] for s in shots)
    if "frames" in tl and tl["frames"] != total:
        log(f"WARNING timeline.frames={tl['frames']} but sum(shots.frames)={total}; using the sum")
    if abs(total / fps - float(tl["duration"])) > 1.0 / fps + 1e-6:
        log(f"WARNING timeline duration {tl['duration']} vs frames {total} ({total / fps:.3f}s)")
    ep_ids = [s["id"] for s in ep.get("shots", [])]
    tl_ids = [s["id"] for s in shots]
    if ep_ids and ep_ids != tl_ids:
        raise Fail(f"timeline shot ids differ from episode shot ids:\n  episode {ep_ids}\n  timeline {tl_ids}")
    # words
    expected = T.words(T.narration(ep)) if ep.get("shots") else None
    words = wd["words"]
    if expected is not None and len(expected) != len(words):
        raise Fail(f"words.json has {len(words)} words, episode narration has {len(expected)}")
    if expected:
        bad = [(i, w["text"], e) for i, (w, e) in enumerate(zip(words, expected)) if T.norm(w["text"]) != T.norm(e)]
        if bad:
            raise Fail(f"words.json tokens differ from the episode narration, first: {bad[0]}")
    # narration
    if not os.path.exists(a.narration):
        raise Fail(f"narration not found: {a.narration}")
    nd = float(json.loads(run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json",
                               a.narration], "ffprobe narration").stdout)["format"]["duration"])
    vd = total / fps
    if nd > vd + 0.05:
        raise Fail(f"narration ({nd:.2f}s) is longer than the video ({vd:.2f}s)")
    if words and words[-1]["end"] > vd:
        raise Fail(f"last word ends at {words[-1]['end']:.2f}s after the video end {vd:.2f}s")
    if not os.path.exists(a.music):
        raise Fail(f"music not found: {a.music}")
    # clips
    clips, problems = [], []
    fixdir = os.path.join(work, "fixed")
    for s in shots:
        p = os.path.join(a.shots, f"{s['id']}.mp4")
        if not os.path.exists(p):
            problems.append(f"shot {s['id']}: missing {p}")
            continue
        pr = probe_clip(p)
        need = s["frames"]
        diff = pr["frames"] - need
        fmt_ok = (pr["w"], pr["h"]) == (W_IN, H_IN) and abs(pr["fps"] - fps) < 1e-3 and pr["pix_fmt"] == "yuv420p" \
            and pr["codec"] == "h264"
        if diff == 0 and fmt_ok:
            clips.append(p)
            continue
        if abs(diff) > 3 and not a.lenient:
            problems.append(f"shot {s['id']}: {pr['frames']} frames, timeline wants {need} (use --lenient to pad/trim)")
            continue
        log(f"WARNING shot {s['id']}: {pr['w']}x{pr['h']} {pr['fps']:.2f}fps {pr['pix_fmt']} {pr['frames']} frames "
            f"(want {W_IN}x{H_IN} 30fps yuv420p {need}) → normalising")
        os.makedirs(fixdir, exist_ok=True)
        q = os.path.join(fixdir, f"{s['id']}.mp4")
        vf = (f"fps={fps},scale={W_IN}:{H_IN}:flags=lanczos,setsar=1,format=yuv420p,"
              f"tpad=stop_mode=clone:stop={max(0, -diff) + 2}")
        run(["ffmpeg", "-v", "error", "-y", "-i", p, "-vf", vf, "-frames:v", str(need), "-an", "-c:v", "libx264",
             "-crf", "10", "-preset", "veryfast", "-pix_fmt", "yuv420p", q], f"normalise shot {s['id']}")
        if probe_clip(q)["frames"] != need:
            problems.append(f"shot {s['id']}: could not normalise to {need} frames")
        clips.append(q)
    if problems:
        raise Fail("input validation failed:\n  " + "\n  ".join(problems))
    cs = probe_clip(clips[0])["colorspace"]
    return clips, total, cs


# ---------------------------------------------------------------------------------------------- audio
def decode(path, channels):
    r = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-ac", str(channels), "-ar", str(SR), "-"],
                       capture_output=True)
    if r.returncode != 0:
        raise Fail(f"decode {path} failed: {r.stderr.decode()[-800:]}")
    return np.frombuffer(r.stdout, np.float32).reshape(-1, channels).astype(np.float64)


def write_wav(path, x):
    import soundfile as sf
    sf.write(path, x.astype(np.float32), SR, subtype="FLOAT")


def loudness(path):
    """Integrated loudness / true peak / LRA / threshold via ffmpeg loudnorm (analysis pass)."""
    r = run(["ffmpeg", "-hide_banner", "-nostats", "-i", path, "-af", "loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json",
             "-f", "null", "-"], f"loudness {path}")
    txt = r.stderr[r.stderr.rindex("{"):r.stderr.rindex("}") + 1]
    return json.loads(txt)


def duck_gain(voice, duck_db, voice_lufs, attack=0.08, release=0.35, hold=0.25):
    """Per-sample music gain (linear): −duck_db while the narration is active."""
    hop = SR // 100
    n = len(voice) // hop + 1
    v = np.pad(voice[:, 0] if voice.ndim > 1 else voice, (0, n * hop - len(voice)))
    rms = np.sqrt(np.mean(v.reshape(n, hop) ** 2, axis=1) + 1e-12)
    act = 20 * np.log10(rms) > max(-55.0, voice_lufs - 22.0)
    # bridge short gaps between words (no pumping inside phrases)
    k = int(hold * 100)
    idx = np.where(act)[0]
    for i0, i1 in zip(idx[:-1], idx[1:]):
        if 1 < i1 - i0 <= k:
            act[i0:i1] = True
    target = np.where(act, -float(duck_db), 0.0)
    g = np.zeros(n)
    a_c, r_c = np.exp(-0.01 / attack), np.exp(-0.01 / release)
    cur = 0.0
    for i in range(n):
        c = a_c if target[i] < cur else r_c
        cur = c * cur + (1 - c) * target[i]
        g[i] = cur
    gl = 10 ** (g / 20)
    return np.interp(np.arange(len(voice)), np.arange(n) * hop + hop / 2, gl), act.mean()


def limiter(x, ceiling_db, lookahead=0.005):
    """Look-ahead peak limiter on 4x-oversampled peaks (approximate true peak)."""
    from scipy import ndimage as ndi
    from scipy.signal import resample_poly
    ceil = 10 ** (ceiling_db / 20)
    up = np.abs(resample_poly(x, 4, 1, axis=0)).max(axis=1)
    peak = up[: len(x) * 4].reshape(-1, 4).max(axis=1)
    if peak.max() <= ceil:
        return x, 0
    g = np.minimum(1.0, ceil / (peak + 1e-12))
    w = max(1, int(lookahead * SR))
    g = ndi.minimum_filter1d(g, size=2 * w + 1)
    g = ndi.uniform_filter1d(g, size=w)
    return x * g[:, None], int((g < 0.999).sum())


def build_audio(a, n_samples, work):
    dur = n_samples / SR
    voice = decode(a.narration, 1)[:n_samples]
    voice = np.pad(voice, ((0, n_samples - len(voice)), (0, 0)))
    music = decode(a.music, 2)
    if len(music) == 0:
        raise Fail("music decodes to 0 samples")
    if len(music) < n_samples:
        log(f"music shorter than the video ({len(music) / SR:.1f}s < {dur:.1f}s): looping with crossfade")
        reps = int(np.ceil(n_samples / len(music))) + 1
        xf = min(int(0.5 * SR), len(music) // 4)
        out = music.copy()
        ramp = np.linspace(0, 1, xf)[:, None]
        for _ in range(reps):
            out = np.concatenate([out[:-xf], out[-xf:] * (1 - ramp) + music[:xf] * ramp, music[xf:]])
            if len(out) >= n_samples:
                break
        music = out
    music = music[:n_samples].copy()
    # levels
    tmpv, tmpm = os.path.join(work, "voice_raw.wav"), os.path.join(work, "music_raw.wav")
    write_wav(tmpv, voice)
    write_wav(tmpm, music)
    lv, lm = float(loudness(tmpv)["input_i"]), float(loudness(tmpm)["input_i"])
    if not np.isfinite(lv) or lv < -70:
        raise Fail(f"narration is silent (integrated {lv} LUFS)")
    gv = a.voice_lufs - lv
    voice *= 10 ** (gv / 20)
    music_target = a.voice_lufs + a.music_rel
    gm = (music_target - lm) if np.isfinite(lm) and lm > -70 else 0.0
    music *= 10 ** (gm / 20)
    # fades
    fi, fo = int(min(0.4, dur / 4) * SR), int(min(a.fade_out, dur / 3) * SR)
    music[:fi] *= np.linspace(0, 1, fi)[:, None]
    music[n_samples - fo:] *= np.linspace(1, 0, fo)[:, None]
    gain, speech_share = duck_gain(voice, a.duck_db, a.voice_lufs)
    music *= gain[:, None]
    mix = voice.repeat(2, axis=1) + music
    log(f"audio: narration {lv:.1f} LUFS → {a.voice_lufs:.1f} ({gv:+.1f} dB); music {lm:.1f} LUFS → "
        f"{music_target:.1f} ({gm:+.1f} dB), ducked {a.duck_db} dB under speech ({100 * speech_share:.0f}% of the time)")
    # pre-limit so the final loudnorm can stay linear (gain to −14 LUFS must not push peaks over the TP target)
    mixp = os.path.join(work, "mix_prelim.wav")
    write_wav(mixp, mix)
    li = float(loudness(mixp)["input_i"])
    ceiling = a.tp - 0.3 - (a.lufs - li)
    mix, nlim = limiter(mix, ceiling)
    mixf = os.path.join(work, "mix.wav")
    write_wav(mixf, mix)
    m = loudness(mixf)
    log(f"audio: mix {li:.1f} LUFS, limiter ceiling {ceiling:.1f} dBFS ({nlim} samples limited); "
        f"pass-1 measure I={m['input_i']} TP={m['input_tp']} LRA={m['input_lra']}")
    os.remove(tmpv), os.remove(tmpm), os.remove(mixp)
    return mixf, m


# ---------------------------------------------------------------------------------------------- video
def bino_ranges(ep, tl):
    flags = {s["id"]: bool(s.get("binoculars")) for s in ep.get("shots", [])}
    out, f = [], 0
    for s in tl["shots"]:
        if flags.get(s["id"]):
            out.append((f, f + s["frames"] - 1))
        f += s["frames"]
    merged = []
    for r in out:
        if merged and r[0] == merged[-1][1] + 1:
            merged[-1] = (merged[-1][0], r[1])
        else:
            merged.append(r)
    return merged


def stamp_of(a, files):
    h = hashlib.sha1()
    h.update(json.dumps({k: v for k, v in vars(a).items() if k not in ("force",)}, sort_keys=True).encode())
    for f in files:
        st = os.stat(f)
        h.update(f"{f}:{st.st_size}:{st.st_mtime_ns}".encode())
    for f in sorted(os.listdir(HERE)):
        if f.endswith(".py"):
            h.update(open(os.path.join(HERE, f), "rb").read())
    return h.hexdigest()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--episode", required=True)
    ap.add_argument("--timeline", required=True)
    ap.add_argument("--words", required=True)
    ap.add_argument("--shots", required=True)
    ap.add_argument("--narration", required=True)
    ap.add_argument("--music", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--crf", type=int, default=18)
    ap.add_argument("--preset", default="medium")
    ap.add_argument("--lufs", type=float, default=-14.0, help="final integrated loudness")
    ap.add_argument("--tp", type=float, default=-1.5, help="loudnorm true-peak target (AAC adds ~0.3 dB)")
    ap.add_argument("--voice-lufs", type=float, default=-16.0, help="narration level before the final loudnorm")
    ap.add_argument("--music-rel", type=float, default=-8.0, help="music bed loudness relative to the voice (LU)")
    ap.add_argument("--duck-db", type=float, default=4.0, help="extra music attenuation while the narrator speaks")
    ap.add_argument("--fade-out", type=float, default=2.0, help="music fade-out at the end (s)")
    ap.add_argument("--lenient", action="store_true", help="pad/trim clips whatever their frame-count error")
    ap.add_argument("--no-captions", action="store_true")
    ap.add_argument("--no-contact", action="store_true")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--keep-temp", action="store_true")
    a = ap.parse_args()
    for k in ("episode", "timeline", "words", "shots", "narration", "music", "out"):
        setattr(a, k, os.path.abspath(getattr(a, k)))
    try:
        ep = json.load(open(a.episode, encoding="utf-8"))
        tl = json.load(open(a.timeline, encoding="utf-8"))
        wd = json.load(open(a.words, encoding="utf-8"))
    except (OSError, ValueError) as e:
        raise SystemExit(f"[post] ERROR reading inputs: {e}")
    slug = ep.get("id") or os.path.splitext(os.path.basename(a.out))[0]
    work = os.path.join(os.path.dirname(a.shots.rstrip("/")), "post")
    os.makedirs(work, exist_ok=True)
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    contact = os.path.join(os.path.dirname(a.out), f"{os.path.splitext(os.path.basename(a.out))[0]}_contact.jpg")
    try:
        shot_files = [os.path.join(a.shots, f"{s['id']}.mp4") for s in tl["shots"]]
        inputs = [a.episode, a.timeline, a.words, a.narration, a.music, MASK, CAP.FONT_FILE] + \
            [f for f in shot_files if os.path.exists(f)]
        stamp = stamp_of(a, inputs)
        stamp_path = os.path.join(work, "assemble.stamp")
        if not a.force and os.path.exists(a.out) and os.path.exists(stamp_path) and open(stamp_path).read() == stamp:
            log(f"up to date: {a.out} (inputs and code unchanged; --force to rebuild)")
            return
        log(f"assembling '{slug}': {len(tl['shots'])} shots → {a.out}")
        clips, total, cs = validate(a, ep, tl, wd, work)
        fps = 30
        dur = total / fps
        n_samples = int(round(dur * SR))
        log(f"validated: {len(clips)} clips, {total} frames = {dur:.3f}s, narration {wd.get('duration', '?')}s")

        # captions
        ass_path = os.path.join(work, "captions.ass")
        ass, events = CAP.build_ass(wd["words"], ep, dur, fps)
        open(ass_path, "w", encoding="utf-8").write(ass)
        log(f"captions: {len(events)} word events ({sum(1 for e in events if e[4])} highlighted) → {ass_path}")

        # audio
        mixf, m = build_audio(a, n_samples, work)

        # video graph
        lst = os.path.join(work, "concat.txt")
        with open(lst, "w") as f:
            for c in clips:
                f.write("file '" + c.replace("'", "'\\''") + "'\n")
        ranges = bino_ranges(ep, tl)
        in_matrix = "bt709" if cs == "bt709" else "bt601"
        g = [f"[0:v]setpts=N/({fps}*TB),scale={W_OUT}:{H_OUT}:flags=lanczos+accurate_rnd+full_chroma_int:"
             f"in_color_matrix={in_matrix}:out_color_matrix=bt709:in_range=tv:out_range=tv,setsar=1[v0]"]
        last = "v0"
        if ranges:
            en = "+".join(f"between(n,{r0},{r1})" for r0, r1 in ranges)
            g.append(f"[{last}][1:v]overlay=0:0:format=auto:eof_action=repeat:enable='{en}'[v1]")
            last = "v1"
        vf = f"[{last}]"
        if not a.no_captions:
            vf += f"ass=filename='{esc(ass_path)}':fontsdir='{esc(CAP.FONTS_DIR)}',"
        vf += "format=yuv420p[vout]"
        g.append(vf)
        aidx = 2 if ranges else 1
        g.append(f"[{aidx}:a]loudnorm=I={a.lufs}:TP={a.tp}:LRA=11:measured_I={m['input_i']}:measured_TP={m['input_tp']}:"
                 f"measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:offset={m['target_offset']}:"
                 f"linear=true:print_format=summary,aresample={SR},aformat=sample_fmts=fltp:channel_layouts=stereo[aout]")
        graph = os.path.join(work, "graph.txt")
        open(graph, "w").write(";\n".join(g))
        tmp_out = a.out + ".part.mp4"
        cmd = ["ffmpeg", "-hide_banner", "-nostats", "-y", "-f", "concat", "-safe", "0", "-i", lst]
        if ranges:
            cmd += ["-i", MASK]
        cmd += ["-i", mixf, "-filter_complex_script", graph, "-map", "[vout]", "-map", "[aout]",
                "-frames:v", str(total), "-fps_mode", "cfr", "-r", str(fps),
                "-c:v", "libx264", "-preset", a.preset, "-crf", str(a.crf), "-profile:v", "high", "-pix_fmt", "yuv420p",
                "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
                "-x264-params", "keyint=60:min-keyint=30",
                "-c:a", "aac", "-b:a", "192k", "-ar", str(SR), "-ac", "2",
                "-movflags", "+faststart", "-metadata", f"title={ep.get('title', slug)}", tmp_out]
        log(f"encoding: concat → scale lanczos → {len(ranges)} binocular range(s) → captions → x264 crf {a.crf} "
            f"{a.preset} (+ loudnorm {a.lufs} LUFS)")
        t1 = time.time()
        r = run(cmd, "final encode")
        summ = [l for l in r.stderr.splitlines() if "Normalization Type" in l or "Output Integrated" in l]
        if summ:
            log("loudnorm: " + "; ".join(s.strip() for s in summ))
        log(f"encoded in {time.time() - t1:.1f}s ({total / max(1e-6, time.time() - t1):.1f} fps)")

        # verify
        pr = probe_clip(tmp_out)
        if pr["frames"] != total:
            raise Fail(f"output has {pr['frames']} frames, timeline total is {total}")
        if (pr["w"], pr["h"]) != (W_OUT, H_OUT):
            raise Fail(f"output is {pr['w']}x{pr['h']}")
        os.replace(tmp_out, a.out)
        log(f"verified: {total} frames, {W_OUT}x{H_OUT} → {a.out} ({os.path.getsize(a.out) / 1e6:.1f} MB)")
        if not a.no_contact:
            CS.make_contact(a.out, tl, ep, contact)
            log(f"contact sheet → {contact}")
        open(stamp_path, "w").write(stamp)
        if not a.keep_temp:
            for f in ("mix.wav",):
                p = os.path.join(work, f)
                if os.path.exists(p):
                    os.remove(p)
            shutil.rmtree(os.path.join(work, "fixed"), ignore_errors=True)
        log("done")
    except Fail as e:
        print(f"[post] ERROR: {e}", file=sys.stderr, flush=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
