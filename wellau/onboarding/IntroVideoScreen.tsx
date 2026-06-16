import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import introVideoUrl from "@wellau/assets/wellau.mp4";
import { wellauBrand } from "@wellau/brand";

interface IntroVideoScreenProps {
  onComplete: () => void;
}

export function IntroVideoScreen({ onComplete }: IntroVideoScreenProps) {
  const [failed, setFailed] = useState(false);
  const [needsGesture, setNeedsGesture] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const startWithSound = async () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = false;
    video.volume = 1;
    try {
      await video.play();
      setNeedsGesture(false);
    } catch {
      setNeedsGesture(true);
    }
  };

  return (
    <div className="flex h-screen w-screen items-center justify-center overflow-hidden bg-black text-white">
      {failed ? (
        <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-6 text-center">
          <h1 className="text-2xl font-semibold">{wellauBrand.productName}</h1>
          <p className="text-sm text-white/70">
            首登视频加载失败。你可以继续进入登录页。
          </p>
          <Button onClick={onComplete}>继续登录</Button>
        </div>
      ) : (
        <div className="relative h-full w-full">
          <video
            ref={videoRef}
            className="h-full w-full object-cover"
            src={introVideoUrl}
            autoPlay
            muted={false}
            playsInline
            controls={false}
            onCanPlay={startWithSound}
            onEnded={onComplete}
            onError={() => setFailed(true)}
          />
          {needsGesture && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm">
              <Button onClick={startWithSound}>点击播放</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
