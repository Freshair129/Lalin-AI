import { useCallback, useEffect, useState } from "react";

/** Tracks a single preview; a changed recipe can never revive the old result. */
export function useWarpPreviewValidity(inputKey: string) {
  const [submittedKey, setSubmittedKey] = useState<string | null>(null);
  const [anchorDirty, setAnchorDirty] = useState(false);

  useEffect(() => {
    if (submittedKey !== null && submittedKey !== inputKey) {
      setSubmittedKey(null);
      setAnchorDirty(false);
    }
  }, [inputKey, submittedKey]);

  const startPreview = useCallback(() => {
    setSubmittedKey(inputKey);
    setAnchorDirty(false);
  }, [inputKey]);
  const markAnchorChanged = useCallback(() => setAnchorDirty(true), []);
  const canShow = submittedKey !== null && submittedKey === inputKey;
  return { canShow, canAudition: canShow && !anchorDirty, startPreview, markAnchorChanged };
}
