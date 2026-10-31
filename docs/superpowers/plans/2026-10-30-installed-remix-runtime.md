# Installed remix runtime repair

The full Windows sidecar excludes librosa and cannot run the Python Demucs CLI: in a frozen process `sys.executable` is the sidecar, not a Python interpreter. A health check does not exercise either dependency.

1. Add a pinned librosa dependency for full builds, include its numba runtime and metadata in the frozen sidecar, and keep lite and GPL optional dependencies excluded. Fail a full build if the runtime dependency is missing.
2. Support an explicitly configured external Python interpreter for Demucs in frozen builds. Keep the existing source interpreter behavior and default an external auto device to CPU; classify explicit CUDA jobs for the GPU queue. Do not bundle GPL plugins or model weights. Return an actionable error when no interpreter is configured.
3. Test source and frozen interpreter selection, full package configuration, and missing runtime handling. Build and test the installed sidecar with a real Demucs runtime and licensed fixture, then exercise expiration and regeneration in the installed desktop. Record whether each GUI action, playback, and render actually ran; preserve the production 30-minute TTL.
