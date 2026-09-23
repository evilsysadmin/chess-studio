extends RefCounted

# Pure locomotion selection for authored Matthias raster banks. Keeping the
# pixel-scoring loop here prevents matthias_art.gd from becoming a second art
# pipeline while letting both legacy and 8x18 banks share one deterministic rule.

static func select_run_source_row(
    image: Image,
    weapon_id: String,
    run_row: int,
    walk_row: int,
    cell_size: int,
    run_frames: int,
    walk_frames: int,
    sample_step: int,
    pixel_diff_threshold: float,
    min_diff: float,
    relative_gain: float,
    min_score: float,
) -> int:
    var run_score := motion_score(
        image, run_row, run_frames, cell_size, sample_step, pixel_diff_threshold
    )
    var walk_score := motion_score(
        image, walk_row, walk_frames, cell_size, sample_step, pixel_diff_threshold
    )
    if (
        walk_score > run_score + min_diff
        and (
            walk_score > run_score * relative_gain
            or run_score < min_score
        )
    ):
        push_warning(
            "Matthias %s run row has weak lower-body motion (%.3f vs walk %.3f); using authored walk stride at run cadence"
            % [weapon_id, run_score, walk_score]
        )
        return walk_row
    return run_row


static func motion_score(
    image: Image,
    row: int,
    frame_count: int,
    cell_size: int,
    sample_step: int,
    pixel_diff_threshold: float,
) -> float:
    if frame_count <= 1:
        return 0.0
    var changed := 0
    var sampled := 0
    var y_start := int(round(float(cell_size) * 0.55))
    var y_end := cell_size - 12
    var x_start := 18
    var x_end := cell_size - 18
    for frame_index in range(1, frame_count):
        var previous_x := (frame_index - 1) * cell_size
        var current_x := frame_index * cell_size
        var base_y := row * cell_size
        for local_y in range(y_start, y_end, sample_step):
            for local_x in range(x_start, x_end, sample_step):
                var previous := image.get_pixel(previous_x + local_x, base_y + local_y)
                var current := image.get_pixel(current_x + local_x, base_y + local_y)
                if maxf(previous.a, current.a) <= 0.10:
                    continue
                var pixel_diff := (
                    absf(previous.r - current.r)
                    + absf(previous.g - current.g)
                    + absf(previous.b - current.b)
                    + absf(previous.a - current.a)
                )
                if pixel_diff >= pixel_diff_threshold:
                    changed += 1
                sampled += 1
    if sampled <= 0:
        return 0.0
    return float(changed) / float(sampled)
