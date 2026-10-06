class_name ChessFootballAudio
extends Node

const MIX_RATE := 44100
const POOL_SIZE := 10

var _players: Array[AudioStreamPlayer] = []
var _streams: Dictionary = {}
var _cursor: int = 0

func _ready() -> void:
	for index in range(POOL_SIZE):
		var player := AudioStreamPlayer.new()
		player.name = "FootballVoice_%02d" % index
		add_child(player)
		_players.append(player)
	_build_streams()

func play_whistle() -> void:
	# Referee cue, not an alarm: short, slightly lower and tucked behind the ball audio.
	_play("whistle", -9.0, 0.94)

func play_pass() -> void:
	_play("pass", -4.0, 1.0)

func play_shot(charge_ratio: float) -> void:
	var ratio := clampf(charge_ratio, 0.0, 1.0)
	_play("shot", lerpf(-3.5, -0.5, ratio), lerpf(1.04, 0.92, ratio))

func play_tackle() -> void:
	_play("tackle", -2.5, 1.0)

func play_keeper_save() -> void:
	_play("save", -3.0, 1.0)

func play_goal() -> void:
	_play("goal", -1.0, 1.0)

func play_goal_frame(impact_speed: float) -> void:
	var strength := clampf((impact_speed - 350.0) / 900.0, 0.0, 1.0)
	_play("post", lerpf(-5.0, -0.4, strength), lerpf(1.08, 0.92, strength))

func debug_stream_names() -> Array[String]:
	var names: Array[String] = []
	for key in _streams.keys():
		names.append(String(key))
	names.sort()
	return names

func _play(key: String, volume_db: float, pitch_scale: float) -> void:
	var stream = _streams.get(key)
	if stream == null or _players.is_empty():
		return
	var voice := _players[_cursor]
	_cursor = (_cursor + 1) % _players.size()
	voice.stop()
	voice.stream = stream
	voice.volume_db = volume_db
	voice.pitch_scale = pitch_scale
	voice.play()

func _build_streams() -> void:
	_streams["pass"] = _make_ball_strike(0.070, 190.0, 118.0, 0.46, 0.18, 101)
	_streams["shot"] = _make_ball_strike(0.135, 150.0, 62.0, 0.82, 0.31, 211)
	_streams["tackle"] = _make_impact(0.105, 94.0, 48.0, 0.72, 0.52, 307)
	_streams["save"] = _make_impact(0.082, 260.0, 105.0, 0.52, 0.66, 401)
	_streams["whistle"] = _make_whistle(0.20)
	_streams["post"] = _make_metal_ring(0.46)
	_streams["goal"] = _make_goal_swell(1.10, 503)

func _make_ball_strike(
	duration: float,
	start_hz: float,
	end_hz: float,
	body_gain: float,
	noise_gain: float,
	seed: int,
) -> AudioStreamWAV:
	var sample_count := maxi(1, int(duration * float(MIX_RATE)))
	var data := PackedByteArray()
	data.resize(sample_count * 2)
	var phase := 0.0
	var noise_state := seed
	var previous_noise := 0.0

	for index in range(sample_count):
		var seconds := float(index) / float(MIX_RATE)
		var t := float(index) / float(sample_count)
		var hz := lerpf(start_hz, end_hz, t)
		phase += TAU * hz / float(MIX_RATE)
		noise_state = int((noise_state * 1103515245 + 12345) & 0x7fffffff)
		var noise := (float(noise_state) / 1073741824.0) - 1.0
		var snap := noise - previous_noise * 0.70
		previous_noise = noise
		var transient := exp(-seconds * 180.0)
		var body_env := exp(-seconds * 31.0)
		var raw := sin(phase) * body_gain * body_env + snap * noise_gain * transient
		var sample := raw / (1.0 + absf(raw) * 0.34)
		data.encode_s16(index * 2, int(round(clampf(sample, -1.0, 1.0) * 32767.0)))

	return _wav_from_data(data)

func _make_impact(
	duration: float,
	start_hz: float,
	end_hz: float,
	tone_gain: float,
	noise_gain: float,
	seed: int,
) -> AudioStreamWAV:
	var sample_count := maxi(1, int(duration * float(MIX_RATE)))
	var data := PackedByteArray()
	data.resize(sample_count * 2)
	var phase := 0.0
	var noise_state := seed

	for index in range(sample_count):
		var seconds := float(index) / float(MIX_RATE)
		var t := float(index) / float(sample_count)
		var hz := lerpf(start_hz, end_hz, t)
		phase += TAU * hz / float(MIX_RATE)
		noise_state = int((noise_state * 1103515245 + 12345) & 0x7fffffff)
		var noise := (float(noise_state) / 1073741824.0) - 1.0
		var envelope := exp(-seconds * 34.0)
		var click := noise * exp(-seconds * 220.0)
		var raw := sin(phase) * tone_gain * envelope + click * noise_gain
		var sample := raw / (1.0 + absf(raw) * 0.42)
		data.encode_s16(index * 2, int(round(clampf(sample, -1.0, 1.0) * 32767.0)))

	return _wav_from_data(data)

func _make_whistle(duration: float) -> AudioStreamWAV:
	var sample_count := maxi(1, int(duration * float(MIX_RATE)))
	var data := PackedByteArray()
	data.resize(sample_count * 2)
	var phase_a := 0.0
	var phase_b := 0.0

	for index in range(sample_count):
		var t := float(index) / float(sample_count)
		var seconds := float(index) / float(MIX_RATE)
		var vibrato := sin(TAU * 7.2 * seconds) * 22.0
		phase_a += TAU * (1980.0 + vibrato) / float(MIX_RATE)
		phase_b += TAU * (2440.0 + vibrato * 0.65) / float(MIX_RATE)
		var attack := minf(1.0, t / 0.035)
		var release := minf(1.0, (1.0 - t) / 0.12)
		var envelope := attack * release
		var raw := (sin(phase_a) * 0.58 + sin(phase_b) * 0.25) * envelope
		data.encode_s16(index * 2, int(round(clampf(raw, -1.0, 1.0) * 32767.0)))

	return _wav_from_data(data)

func _make_metal_ring(duration: float) -> AudioStreamWAV:
	var sample_count := maxi(1, int(duration * float(MIX_RATE)))
	var data := PackedByteArray()
	data.resize(sample_count * 2)
	var phase_a := 0.0
	var phase_b := 0.0
	var phase_c := 0.0

	for index in range(sample_count):
		var seconds := float(index) / float(MIX_RATE)
		phase_a += TAU * 740.0 / float(MIX_RATE)
		phase_b += TAU * 1190.0 / float(MIX_RATE)
		phase_c += TAU * 2070.0 / float(MIX_RATE)
		var ring_env := exp(-seconds * 7.8)
		var bright_env := exp(-seconds * 15.0)
		var transient := exp(-seconds * 120.0)
		var raw := (
			sin(phase_a) * 0.50 * ring_env
			+ sin(phase_b) * 0.27 * ring_env
			+ sin(phase_c) * 0.16 * bright_env
			+ sin(phase_c * 1.71) * 0.10 * transient
		)
		var sample := raw / (1.0 + absf(raw) * 0.22)
		data.encode_s16(index * 2, int(round(clampf(sample, -1.0, 1.0) * 32767.0)))

	return _wav_from_data(data)

func _make_goal_swell(duration: float, seed: int) -> AudioStreamWAV:
	var sample_count := maxi(1, int(duration * float(MIX_RATE)))
	var data := PackedByteArray()
	data.resize(sample_count * 2)
	var noise_state := seed
	var low_phase := 0.0
	var clap_phase := 0.0

	for index in range(sample_count):
		var t := float(index) / float(sample_count)
		var seconds := float(index) / float(MIX_RATE)
		noise_state = int((noise_state * 1103515245 + 12345) & 0x7fffffff)
		var noise := (float(noise_state) / 1073741824.0) - 1.0
		low_phase += TAU * 82.0 / float(MIX_RATE)
		clap_phase += TAU * 6.0 / float(MIX_RATE)
		var attack := minf(1.0, t / 0.12)
		var decay := pow(maxf(0.0, 1.0 - t), 0.55)
		var crowd := noise * 0.26 + sin(low_phase) * 0.12
		var claps := maxf(0.0, sin(clap_phase)) * noise * 0.20
		var stinger := sin(TAU * 620.0 * seconds) * exp(-seconds * 6.5) * 0.18
		var raw := (crowd + claps) * attack * decay + stinger
		var sample := raw / (1.0 + absf(raw) * 0.30)
		data.encode_s16(index * 2, int(round(clampf(sample, -1.0, 1.0) * 32767.0)))

	return _wav_from_data(data)

func _wav_from_data(data: PackedByteArray) -> AudioStreamWAV:
	var stream := AudioStreamWAV.new()
	stream.format = AudioStreamWAV.FORMAT_16_BITS
	stream.mix_rate = MIX_RATE
	stream.stereo = false
	stream.data = data
	return stream
