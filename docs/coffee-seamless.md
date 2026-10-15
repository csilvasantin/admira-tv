The seven-screen coffee programme retains a canvas of its last visible frame until the next video has decoded a frame at the shared-clock position. It then crossfades over 320 ms. The next programme item is warmed in a bounded, muted decoder; adoption replays metadata handling because a warm element may already have fired loadedmetadata. Late preload callbacks cannot pause an adopted active video. Standby clears both held imagery and the warm decoder.

This is opted in by the existing coffee programme item prefix; unrelated playlist playback is unchanged. The source MP4 files remain native Stock exports.

Validation: 137 canal checks pass; one pre-existing canal-eficiencia check still expects the older master clock assignment and fails on the unchanged baseline as well. Four behavioural tests exercise decoded/seek gating, crossfade release, warm adoption race and standby cancellation. Actual browser and native playback require verification after release.
