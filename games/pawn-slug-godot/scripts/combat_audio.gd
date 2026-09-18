extends Node

const MIX_RATE := 22050
const POOL_SIZE := 12

var _players: Array[AudioStreamPlayer] = []
var _streams: Dictionary = {}
var _cursor := 0
var _ambient_player: AudioStreamPlayer

func _ready() -> void:
    for index in range(POOL_SIZE):
        var player := AudioStreamPlayer.new()
        player.name = "Voice_%02d" % index
        add_child(player)
        _players.append(player)
    _build_streams()
    _start_ambient()

func _start_ambient() -> void:
    _ambient_player = AudioStreamPlayer.new()
    _ambient_player.name = "BattlefieldAmbience"
    _ambient_player.stream = _make_ambient_loop(8.0)
    _ambient_player.volume_db = -29.0
    add_child(_ambient_player)
    _ambient_player.play()

func play_weapon(weapon: String) -> void:
    var key := "weapon:%s" % weapon
    _play(key, 0.0)

func play_impact(hostile: bool = false) -> void:
    _play("impact", -6.0 if hostile else -3.0)

func play_explosion() -> void:
    _play("explosion", -1.0)

func play_pickup() -> void:
    _play("pickup", -4.0)

func play_hurt() -> void:
    _play("hurt", -3.0)

func play_land(intensity: float) -> void:
    if intensity < 0.20:
        return
    _play("land", lerpf(-12.0, -4.0, clampf(intensity, 0.0, 1.0)))

func _play(key: String, volume_db: float) -> void:
    var stream = _streams.get(key)
    if stream == null or _players.is_empty():
        return
    var voice := _players[_cursor]
    _cursor = (_cursor + 1) % _players.size()
    voice.stop()
    voice.stream = stream
    voice.volume_db = volume_db
    voice.pitch_scale = randf_range(0.97, 1.03)
    voice.play()

func _build_streams() -> void:
    _streams["weapon:pistol"] = _make_noise_tone(0.095, 260.0, 92.0, 0.42, 0.78, 101)
    _streams["weapon:machinegun"] = _make_noise_tone(0.060, 185.0, 105.0, 0.38, 0.60, 211)
    _streams["weapon:shotgun"] = _make_noise_tone(0.175, 135.0, 52.0, 0.78, 0.88, 307)
    _streams["weapon:panzerfaust"] = _make_noise_tone(0.300, 92.0, 34.0, 0.68, 0.92, 401)
    _streams["impact"] = _make_noise_tone(0.075, 980.0, 310.0, 0.72, 0.52, 503)
    _streams["explosion"] = _make_noise_tone(0.420, 76.0, 24.0, 0.78, 0.95, 601)
    _streams["pickup"] = _make_chirp(0.180, 520.0, 980.0, 0.46)
    _streams["hurt"] = _make_noise_tone(0.130, 145.0, 72.0, 0.55, 0.58, 709)
    _streams["land"] = _make_noise_tone(0.085, 105.0, 48.0, 0.35, 0.48, 811)

func _make_noise_tone(
    duration: float,
    start_hz: float,
    end_hz: float,
    noise_mix: float,
    gain: float,
    seed: int,
) -> AudioStreamWAV:
    var sample_count := maxi(1, int(duration * float(MIX_RATE)))
    var data := PackedByteArray()
    data.resize(sample_count * 2)
    var noise_state := seed
    var phase := 0.0

    for index in range(sample_count):
        var t := float(index) / float(sample_count)
        var hz := lerpf(start_hz, end_hz, t)
        phase += TAU * hz / float(MIX_RATE)
        noise_state = int((noise_state * 1103515245 + 12345) & 0x7fffffff)
        var noise := (float(noise_state) / 1073741824.0) - 1.0
        var tone := sin(phase)
        var body := tone * (1.0 - noise_mix) + noise * noise_mix
        var attack := minf(1.0, t / 0.025)
        var decay := pow(maxf(0.0, 1.0 - t), 1.55)
        var sample := clampf(body * attack * decay * gain, -1.0, 1.0)
        data.encode_s16(index * 2, int(round(sample * 32767.0)))

    return _wav_from_data(data)

func _make_chirp(duration: float, start_hz: float, end_hz: float, gain: float) -> AudioStreamWAV:
    var sample_count := maxi(1, int(duration * float(MIX_RATE)))
    var data := PackedByteArray()
    data.resize(sample_count * 2)
    var phase := 0.0

    for index in range(sample_count):
        var t := float(index) / float(sample_count)
        var hz := lerpf(start_hz, end_hz, t)
        phase += TAU * hz / float(MIX_RATE)
        var envelope := sin(PI * clampf(t, 0.0, 1.0))
        var sample := clampf(sin(phase) * envelope * gain, -1.0, 1.0)
        data.encode_s16(index * 2, int(round(sample * 32767.0)))

    return _wav_from_data(data)

func _make_ambient_loop(duration: float) -> AudioStreamWAV:
    var sample_count := maxi(1, int(duration * float(MIX_RATE)))
    var data := PackedByteArray()
    data.resize(sample_count * 2)

    for index in range(sample_count):
        var time := float(index) / float(MIX_RATE)
        var cycle := TAU * time / duration
        # All components complete whole cycles over the buffer so the loop seam
        # stays quiet. Keep this texture deliberately below combat SFX/music.
        var low_rumble := sin(TAU * 41.0 * time) * 0.16
        low_rumble += sin(TAU * 67.0 * time) * 0.07
        var wind := sin(TAU * 131.0 * time + sin(cycle) * 1.7) * 0.026
        wind += sin(TAU * 173.0 * time + sin(cycle * 2.0) * 1.2) * 0.018
        var distant_pulse := sin(TAU * 3.0 * time) * sin(TAU * 47.0 * time) * 0.018
        var breathe := 0.72 + 0.28 * sin(cycle - PI * 0.35)
        var sample := clampf((low_rumble * breathe) + wind + distant_pulse, -1.0, 1.0)
        data.encode_s16(index * 2, int(round(sample * 32767.0)))

    var stream := _wav_from_data(data)
    stream.loop_mode = AudioStreamWAV.LOOP_FORWARD
    stream.loop_begin = 0
    stream.loop_end = sample_count
    return stream

func _wav_from_data(data: PackedByteArray) -> AudioStreamWAV:
    var stream := AudioStreamWAV.new()
    stream.format = AudioStreamWAV.FORMAT_16_BITS
    stream.mix_rate = MIX_RATE
    stream.stereo = false
    stream.data = data
    return stream
