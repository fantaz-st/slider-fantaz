"use client";

import React, { useRef, useEffect, useState } from "react";
import { Canvas, extend, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { shaderMaterial, useAspect } from "@react-three/drei";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { SplitText } from "gsap/SplitText";
import classes from "./VideoSlider.module.css";
import slides from "./data";
import { fragmentShader, vertexShader } from "./shaders";
import { CustomEase } from "gsap/all";
import { Vector2 } from "three";

gsap.registerPlugin(useGSAP, CustomEase, SplitText);

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
    uInputResolution: new Vector2(16, 9),
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
  const { viewport } = useThree();

  const scale = useAspect(viewport.width, viewport.height, 1);

  useFrame(() => {
    const material = materialRef.current;
    if (!material) return;

    material.uTexture1 = texturesRef.current[0];
    material.uTexture2 = texturesRef.current[1];
    material.uTransitionProgress = progressRef.current;

    material.uOffsetAmount = 3;
    material.uColumnsCount = 3.0;
    material.uAngle = (45 * Math.PI) / 180;
    material.uScale = 3;

    const tex = texturesRef.current[1] || texturesRef.current[0];
    if (tex?.image?.videoWidth && tex?.image?.videoHeight) {
      material.uInputResolution = new Vector2(tex.image.videoWidth, tex.image.videoHeight);
    } else {
      material.uInputResolution = new Vector2(16, 9);
    }

    material.uOutputResolution = new Vector2(scale[0], scale[1]);
  });

  return (
    <mesh scale={scale}>
      <planeGeometry args={[1, 1]} />
      <complexShaderMaterial ref={materialRef} />
    </mesh>
  );
};

const VideoSlider = () => {
  const containerRef = useRef(null);
  const scrollTimeout = useRef(null);
  const isTransitioningRef = useRef(false);

  const texturesRef = useRef([]);
  const progressRef = useRef(0);
  const currentIndexRef = useRef(0);
  const directionRef = useRef(1);
  const textureCacheRef = useRef({});

  const loaderBoxRef = useRef(null);
  const titleRef = useRef(null);
  const splitRef = useRef(null);

  const changeSlideRef = useRef(null);
  const autoStartTimeoutRef = useRef(null);

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
      if (autoStartTimeoutRef.current) clearTimeout(autoStartTimeoutRef.current);
      Object.values(textureCacheRef.current).forEach((texture) => {
        disposeTexture(texture);
      });
      if (splitRef.current) {
        splitRef.current.revert();
        splitRef.current = null;
      }
    };
  }, []);

  const animateTitleIn = (index) => {
    if (!titleRef.current) return;

    if (splitRef.current) {
      splitRef.current.revert();
      splitRef.current = null;
    }

    titleRef.current.innerHTML = slides[index].title;

    const split = new SplitText(titleRef.current, { type: "lines,words" });
    splitRef.current = split;

    gsap.fromTo(
      split.words,
      { yPercent: 120 },
      {
        yPercent: 0,
        duration: 0.6,
        ease: "power3.out",
        stagger: 0.06,
      }
    );
  };

  const startFlow = () => {
    if (started) return;
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

  useEffect(() => {
    if (loading) return;
    if (!overlayVisible) return;
    if (started) return;

    if (autoStartTimeoutRef.current) clearTimeout(autoStartTimeoutRef.current);

    autoStartTimeoutRef.current = setTimeout(() => {
      startFlow();
    }, 1000);

    return () => {
      if (autoStartTimeoutRef.current) clearTimeout(autoStartTimeoutRef.current);
    };
  }, [loading, overlayVisible, started]);

  useGSAP(() => {
    if (!started || !containerRef.current) return;

    const firstTexture = textureCacheRef.current[slides[0].video];

    if (firstTexture) {
      texturesRef.current = [WHITE_TEXTURE, firstTexture];
      progressRef.current = 0;
      isTransitioningRef.current = true;

      const revealState = { value: 0 };

      const tl = gsap.timeline({
        onComplete: () => {
          texturesRef.current = [firstTexture, firstTexture];
          progressRef.current = 0;
          isTransitioningRef.current = false;
        },
      });

      tl.to(revealState, {
        value: 1,
        duration: 1.3,
        ease: "power3.out",
        onUpdate: () => {
          progressRef.current = revealState.value;
        },
      });

      tl.add(() => {
        animateTitleIn(0);
      }, "-=1");
    }

    const changeSlide = (direction) => {
      if (isTransitioningRef.current) return;
      isTransitioningRef.current = true;
      directionRef.current = direction;

      const targetIndex = (currentIndexRef.current + direction + slides.length) % slides.length;
      const prevSplit = splitRef.current;

      const OUT_DUR = 0.32;
      const SWAP_AT = 0.24;
      const IN_DUR = 1;

      createVideoTexture(slides[targetIndex].video, null).then((nextVideoTexture) => {
        const transitionState = { value: 0 };
        texturesRef.current[1] = nextVideoTexture;

        const tl = gsap.timeline({
          onComplete: () => {
            texturesRef.current = [nextVideoTexture, nextVideoTexture];
            currentIndexRef.current = targetIndex;
            progressRef.current = 0;
            isTransitioningRef.current = false;
          },
        });

        if (prevSplit && prevSplit.words && prevSplit.words.length) {
          tl.to(
            prevSplit.words,
            {
              yPercent: -120,
              duration: OUT_DUR,
              ease: "power3.in",
              stagger: 0.02,
            },
            0
          );
        } else if (titleRef.current) {
          tl.to(
            titleRef.current,
            {
              yPercent: -120,
              duration: OUT_DUR,
              ease: "power3.in",
            },
            0
          );
        }

        tl.to(
          transitionState,
          {
            value: 1,
            duration: 1.2,
            ease: "power3.out",
            onUpdate: () => {
              progressRef.current = transitionState.value;
            },
          },
          0
        );

        tl.add(() => {
          if (!titleRef.current) return;

          if (splitRef.current) {
            splitRef.current.revert();
            splitRef.current = null;
          }

          titleRef.current.innerHTML = slides[targetIndex].title;

          const nextSplit = new SplitText(titleRef.current, { type: "lines,words" });
          splitRef.current = nextSplit;

          gsap.fromTo(
            nextSplit.words,
            { yPercent: 120 },
            {
              yPercent: 0,
              duration: IN_DUR,
              ease: "power3.out",
              stagger: 0.05,
            }
          );
        }, SWAP_AT);
      });
    };

    changeSlideRef.current = changeSlide;

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
      changeSlideRef.current = null;
    };
  }, [started]);

  const handlePrev = () => {
    if (!started) return;
    if (isTransitioningRef.current) return;
    if (!changeSlideRef.current) return;
    changeSlideRef.current(-1);
  };

  const handleNext = () => {
    if (!started) return;
    if (isTransitioningRef.current) return;
    if (!changeSlideRef.current) return;
    changeSlideRef.current(1);
  };

  return (
    <div className={classes.container} ref={containerRef}>
      {overlayVisible && (
        <div className={classes.loaderOverlay}>
          <div className={classes.loaderBox} ref={loaderBoxRef}>
            <div className={classes.loaderPercent}>{Math.round(progress)}%</div>
            <div className={classes.loaderText}>{loading ? "Loading videos..." : "Ready"}</div>
          </div>
        </div>
      )}

      {started && (
        <>
          <div className={classes.slideContent}>
            <div className={classes.textContainer}>
              <div className={classes.outerMask}>
                <div className={classes.inner}>
                  <h1 ref={titleRef}></h1>
                </div>
              </div>
            </div>

            <div className={classes.footer}>
              <div className={classes.counter}></div>

              <div className={classes.controls}>
                <div className={classes.control} onClick={handlePrev}>
                  <svg viewBox="0 0 25 25" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M14.5 17L10 12.5L14.5 8" stroke="#fff" strokeWidth="1.2" />
                  </svg>
                </div>
                <div className={classes.control} onClick={handleNext}>
                  <svg viewBox="0 0 25 25" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M10.5 8L15 12.5L10.5 17" stroke="#fff" strokeWidth="1.2" />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          <Canvas camera={{ position: [0, 0, 2], fov: 100 }} dpr={[1, 2]}>
            <ShaderPlane texturesRef={texturesRef} progressRef={progressRef} />
          </Canvas>
        </>
      )}
    </div>
  );
};

export default VideoSlider;
