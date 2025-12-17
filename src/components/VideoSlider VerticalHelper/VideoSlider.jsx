"use client";

import React, { useRef, useEffect, useState } from "react";
import { Canvas, extend, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { shaderMaterial } from "@react-three/drei";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import classes from "./VideoSlider.module.css";
import slides from "./data";
import { fragmentShader, vertexShader } from "./shaders";
import { CustomEase } from "gsap/all";
import { Vector2 } from "three";
import { verticalLoop } from "@/helpers/verticalHelper";

gsap.registerPlugin(useGSAP, CustomEase);

CustomEase.create("hop", "M0,0 C0.29,0 0.348,0.05 0.422,0.134 0.494,0.217 0.484,0.355 0.5,0.5 0.518,0.662 0.515,0.793 0.596,0.876 0.701,0.983 0.72,0.987 1,1");

const ComplexShaderMaterial = shaderMaterial(
  {
    uTexture1: new THREE.Texture(),
    uTexture2: new THREE.Texture(),
    uOffsetAmount: 3,
    uColumnsCount: 3.0,
    uTransitionProgress: 0.0,
    uAngle: (45 * Math.PI) / 180,
    uScale: 3,
    uInputResolution: new Vector2(1920, 1080),
    uOutputResolution: new Vector2(1, 1),
  },
  vertexShader,
  fragmentShader
);
extend({ ComplexShaderMaterial });

const createWhiteTexture = () => {
  const data = new Uint8Array([255, 255, 255, 255]);
  const texture = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
  texture.needsUpdate = true;
  return texture;
};

const WHITE_TEXTURE = createWhiteTexture();

const ShaderPlane = ({ texturesRef, progressRef }) => {
  const materialRef = useRef();
  const { viewport, size } = useThree();
  const inputResolution = useRef(new Vector2(1920, 1080));
  const outputResolution = useRef(new Vector2(size.width, size.height));

  useEffect(() => {
    outputResolution.current.set(size.width, size.height);
  }, [size.width, size.height]);

  useEffect(() => {
    if (!materialRef.current) return;
    const m = materialRef.current;
    m.uOffsetAmount = 3;
    m.uColumnsCount = 3.0;
    m.uAngle = (45 * Math.PI) / 180;
    m.uScale = 3;
  }, []);

  useFrame(() => {
    const material = materialRef.current;
    if (!material) return;
    material.uTexture1 = texturesRef.current[0];
    material.uTexture2 = texturesRef.current[1];
    material.uTransitionProgress = progressRef.current;
    material.uInputResolution = inputResolution.current;
    material.uOutputResolution = outputResolution.current;
  });

  return (
    <mesh scale={[viewport.width, viewport.height, 1]}>
      <planeGeometry args={[1, 1]} />
      <complexShaderMaterial ref={materialRef} />
    </mesh>
  );
};

const VideoSlider = () => {
  const containerRef = useRef(null);
  const titleLoopRef = useRef(null);
  const scrollTimeout = useRef(null);
  const isTransitioningRef = useRef(false);

  const texturesRef = useRef([]);
  const progressRef = useRef(0);
  const currentIndexRef = useRef(0);
  const directionRef = useRef(1);
  const textureCacheRef = useRef({});

  const loaderBoxRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [started, setStarted] = useState(false);
  const [overlayVisible, setOverlayVisible] = useState(true);

  const createVideoTexture = (src, onProgress) => {
    const cached = textureCacheRef.current[src];
    if (cached) {
      if (onProgress) onProgress(100);
      return Promise.resolve(cached);
    }

    const video = document.createElement("video");
    video.src = src;
    video.crossOrigin = "anonymous";
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;

    return new Promise((resolve, reject) => {
      const updateProgress = () => {
        const buffered = video.buffered;
        if (buffered.length) {
          const loaded = buffered.end(0);
          const total = video.duration || 1;
          const percent = (loaded / total) * 100;
          if (onProgress) onProgress(percent);
        }
      };

      video.onprogress = updateProgress;
      video.oncanplay = () => {
        video
          .play()
          .then(() => {
            const texture = new THREE.VideoTexture(video);
            textureCacheRef.current[src] = texture;
            resolve(texture);
          })
          .catch((error) => reject(error));
      };

      video.onerror = () => {
        reject(new Error(`Failed to load video: ${src}`));
      };
    });
  };

  const disposeTexture = (texture) => {
    if (texture instanceof THREE.VideoTexture && texture.image) {
      const videoElement = texture.image;
      if (!videoElement.paused) videoElement.pause();
      videoElement.src = "";
      texture.dispose();
    }
  };

  useEffect(() => {
    let isMounted = true;
    const allSlides = slides.filter((s) => s && s.video);
    const perVideoProgress = new Array(allSlides.length).fill(0);

    const handleProgress = (index) => (percent) => {
      perVideoProgress[index] = percent;
      const total = perVideoProgress.reduce((a, b) => a + b, 0) / allSlides.length;
      setProgress(total);
    };

    Promise.all(allSlides.map((slide, index) => createVideoTexture(slide.video, handleProgress(index))))
      .then((videoTextures) => {
        if (!isMounted || !videoTextures.length) return;
        const firstTexture = videoTextures[0];
        texturesRef.current = [firstTexture, firstTexture];
        setLoading(false);
        setProgress(100);
      })
      .catch((error) => {
        console.error("Error loading video textures:", error);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
      Object.values(textureCacheRef.current).forEach((texture) => {
        disposeTexture(texture);
      });
    };
  }, []);

  useGSAP(() => {
    if (!started || !containerRef.current) return;

    const titleItems = gsap.utils.toArray(`.${classes.title}`);
    titleLoopRef.current = verticalLoop(titleItems, {
      speed: 0.7,
      repeat: -1,
      paused: true,
    });

    const titleHeads = titleItems.map((item) => {
      if (item instanceof HTMLElement) {
        const h1 = item.querySelector("h1");
        return h1 || item;
      }
      return item;
    });

    const firstTitle = titleHeads[0];
    const firstTexture = textureCacheRef.current[slides[0].video];

    if (firstTexture) {
      texturesRef.current = [WHITE_TEXTURE, firstTexture];
      progressRef.current = 0;
      isTransitioningRef.current = true;

      const revealState = { value: 0 };

      const introTl = gsap.timeline({
        onComplete: () => {
          texturesRef.current = [firstTexture, firstTexture];
          progressRef.current = 0;
          isTransitioningRef.current = false;
        },
      });

      introTl
        .to(revealState, {
          value: 1,
          duration: 1.3,
          ease: "power3.out",
          onUpdate: () => {
            progressRef.current = revealState.value;
          },
        })
        .from(
          firstTitle,
          {
            opacity: 0,
            yPercent: 20,
            duration: 0.8,
            ease: "power3.out",
          },
          "-=0.35"
        );
    }

    const changeSlide = (direction) => {
      if (isTransitioningRef.current) return;
      isTransitioningRef.current = true;
      directionRef.current = direction;
      const targetIndex = (currentIndexRef.current + direction + slides.length) % slides.length;

      if (direction === 1) {
        titleLoopRef.current.next({
          duration: 0.8,
          ease: "Sine.easeInOut",
        });
      } else {
        titleLoopRef.current.previous({
          duration: 0.8,
          ease: "Sine.easeInOut",
        });
      }

      const transitionState = { value: 0 };

      createVideoTexture(slides[targetIndex].video, null).then((nextVideoTexture) => {
        texturesRef.current[1] = nextVideoTexture;

        gsap.to(transitionState, {
          value: 1,
          duration: 1,
          ease: "hop",
          onUpdate: () => {
            progressRef.current = transitionState.value;
          },
          onComplete: () => {
            texturesRef.current = [nextVideoTexture, nextVideoTexture];
            currentIndexRef.current = targetIndex;
            progressRef.current = 0;
            isTransitioningRef.current = false;
          },
        });
      });
    };

    const handleWheel = (event) => {
      if (isTransitioningRef.current) return;
      if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
      scrollTimeout.current = setTimeout(() => {
        changeSlide(event.deltaY > 0 ? 1 : -1);
      }, 300);
    };

    const el = containerRef.current;
    el.addEventListener("wheel", handleWheel);

    return () => {
      el.removeEventListener("wheel", handleWheel);
      if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
      if (titleLoopRef.current && titleLoopRef.current.kill) {
        titleLoopRef.current.kill();
      }
    };
  }, [started]);

  const handleStart = () => {
    // start slider logic immediately
    setStarted(true);

    if (!loaderBoxRef.current) {
      setOverlayVisible(false);
      return;
    }

    gsap.to(loaderBoxRef.current, {
      y: -40,
      opacity: 0,
      duration: 0.6,
      ease: "power2.out",
      onComplete: () => {
        setOverlayVisible(false);
      },
    });
  };

  return (
    <div className={classes.container} ref={containerRef}>
      {overlayVisible && (
        <div className={classes.loaderOverlay}>
          <div className={classes.loaderBox} ref={loaderBoxRef}>
            <div className={classes.loaderPercent}>{Math.round(progress)}%</div>
            {loading ? (
              <div className={classes.loaderText}>Loading videos...</div>
            ) : (
              <>
                <div className={classes.loaderText}>Ready</div>
                <button className={classes.startButton} onClick={handleStart}>
                  Enter slider
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {started && (
        <>
          <div className={classes.slideContent}>
            <div className={classes.textContainer}>
              <div className={classes.inner}>
                {slides.map((slide, index) => (
                  <div key={index} className={classes.title}>
                    <h1>{slide.title}</h1>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <Canvas camera={{ position: [0, 0, 2], fov: 100 }}>
            <ShaderPlane texturesRef={texturesRef} progressRef={progressRef} />
          </Canvas>
        </>
      )}
    </div>
  );
};

export default VideoSlider;
