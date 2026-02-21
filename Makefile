URL ?= https://youtu.be/m2dPpGzywnQ?si=rgYA07hELdmmsACo
AUDIO ?= data/audio/source.mp3
TOKENS ?= build/ganapati/tokens.json
HIGHLIGHTER ?= apps/web/public/suktas/ganapati/visual/highlights.json
TIMINGS ?= data/alignment/timings.json
ENGINE ?= whisperx

.PHONY: fetch_audio align_audio validate_alignment

fetch_audio:
	python scripts/fetch_youtube_audio.py --url "$(URL)" --out "$(AUDIO)"

align_audio:
	python scripts/align_audio.py --tokens "$(TOKENS)" --highlighter "$(HIGHLIGHTER)" --audio "$(AUDIO)" --out "$(TIMINGS)" --engine "$(ENGINE)" --url "$(URL)"

validate_alignment:
	python scripts/validate_alignment.py --tokens "$(TOKENS)" --highlighter "$(HIGHLIGHTER)" --timings "$(TIMINGS)"
