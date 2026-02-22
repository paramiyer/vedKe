URL ?= https://youtu.be/m2dPpGzywnQ?si=rgYA07hELdmmsACo
AUDIO ?= data/audio/source.mp3
TOKENS ?= build/ganapati/tokens.json
HIGHLIGHTER ?= apps/web/public/suktas/ganapati/visual/highlights.json
TIMINGS ?= data/alignment/timings.json
ANCHORS ?= data/alignment/anchors.json
RETIMED ?= data/alignment/timings.retimed.json
OFFSET_TOKENS ?= 0
ENGINE ?= whisperx
DURATION_MS ?=
PY ?= uv run python

.PHONY: fetch_audio align_audio retime_with_anchors retime_with_offset validate_alignment

fetch_audio:
	$(PY) scripts/fetch_youtube_audio.py --url "$(URL)" --out "$(AUDIO)"

align_audio:
	$(PY) scripts/align_audio.py --tokens "$(TOKENS)" --highlighter "$(HIGHLIGHTER)" --audio "$(AUDIO)" --out "$(TIMINGS)" --engine "$(ENGINE)" --url "$(URL)" $(if $(DURATION_MS),--duration-ms "$(DURATION_MS)",)

retime_with_anchors:
	$(PY) -m services.itx_pipeline retime-with-anchors --timings "$(TIMINGS)" --anchors "$(ANCHORS)" --out "$(RETIMED)"

retime_with_offset:
	$(PY) -m services.itx_pipeline retime-with-offset --timings "$(TIMINGS)" --offset-tokens "$(OFFSET_TOKENS)" --out "$(RETIMED)"

validate_alignment:
	$(PY) scripts/validate_alignment.py --tokens "$(TOKENS)" --highlighter "$(HIGHLIGHTER)" --timings "$(TIMINGS)"
