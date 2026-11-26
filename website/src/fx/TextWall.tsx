/* eslint-disable */
// Text Reveal Wall — Originkit

"use client";

import {
    useRef,
    useEffect,
    useMemo,
    useState,
    useCallback,
    type CSSProperties,
} from "react";
import { gsap } from "gsap";

// ------------------------------------------------------------ //
// UTILITY FUNCTIONS
// ------------------------------------------------------------ //
const ALL_CHARS =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

const DEFAULT_FONT_FAMILY =
    "'Inter Display', Inter, ui-sans-serif, system-ui, sans-serif";
const DEFAULT_FONT_SIZE = 20;

function toPx(value: unknown, fallback: number): number {
    if (typeof value === "number" && isFinite(value)) return value;
    const parsed = parseFloat(String(value ?? ""));
    return isFinite(parsed) ? parsed : fallback;
}

function randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function mapValue(
    value: number,
    inMin: number,
    inMax: number,
    outMin: number,
    outMax: number
): number {
    if (value <= inMin) return outMin;
    if (value >= inMax) return outMax;
    return ((value - inMin) / (inMax - inMin)) * (outMax - outMin) + outMin;
}

function escapeHtml(text: string): string {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

const NAMED_EASES: Record<string, [number, number, number, number]> = {
    linear: [0, 0, 1, 1],
    easeIn: [0.42, 0, 1, 1],
    easeOut: [0, 0, 0.58, 1],
    easeInOut: [0.42, 0, 0.58, 1],
};

function cubicBezierEase(x1: number, y1: number, x2: number, y2: number) {
    const cx = 3 * x1;
    const bx = 3 * (x2 - x1) - cx;
    const ax = 1 - cx - bx;
    const cy = 3 * y1;
    const by = 3 * (y2 - y1) - cy;
    const ay = 1 - cy - by;
    const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
    const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
    const dX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
    return (p: number) => {
        let t = p;
        for (let i = 0; i < 8; i++) {
            const x = sampleX(t) - p;
            const d = dX(t);
            if (Math.abs(x) < 1e-4 || Math.abs(d) < 1e-6) break;
            t -= x / d;
        }
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        return sampleY(t);
    };
}

function makeGsapEase(tr: any) {
    const e = tr?.ease;
    if (Array.isArray(e) && e.length === 4)
        return cubicBezierEase(e[0], e[1], e[2], e[3]);
    const b = (typeof e === "string" && NAMED_EASES[e]) || NAMED_EASES.easeInOut;
    return cubicBezierEase(b[0], b[1], b[2], b[3]);
}

type WordPosition = { word: string; start: number; end: number };
type LineData = { wordPositions: WordPosition[] };

function generateLineDataForWords(
    words: string[],
    totalChars: number
): LineData {
    const wordPositions: WordPosition[] = [];
    const usedRanges: { start: number; end: number }[] = [];
    for (const word of words) {
        const wordLen = word.length;
        if (wordLen >= totalChars) continue;
        let placed = false;
        let attempts = 0;
        const maxAttempts = 50;
        while (!placed && attempts < maxAttempts) {
            const maxStart = totalChars - wordLen;
            if (maxStart < 0) break;
            const start = randomInt(0, maxStart);
            const end = start + wordLen;
            let overlaps = false;
            for (const used of usedRanges) {
                if (
                    (start >= used.start && start < used.end) ||
                    (end > used.start && end <= used.end) ||
                    (start <= used.start && end >= used.end)
                ) {
                    overlaps = true;
                    break;
                }
            }
            if (!overlaps) {
                wordPositions.push({ word, start, end });
                usedRanges.push({ start, end });
                placed = true;
            }
            attempts++;
        }
    }
    wordPositions.sort((a, b) => a.start - b.start);
    return { wordPositions };
}

interface Transition {
    type?: string;
    duration?: number;
    ease?: string | [number, number, number, number];
    delay?: number;
}

interface TextWallProps {
    words?: string[];
    emptyLines?: number;
    textColor?: string;
    wordsColor?: string;
    backgroundColor?: string;
    font?: CSSProperties;
    gap?: number;
    reverse?: boolean;
    transition?: Transition;
    stagger?: number;
    loop?: boolean;
    style?: CSSProperties;
}

// ------------------------------------------------------------ //
// MAIN COMPONENT
// ------------------------------------------------------------ //
export default function TextWall({
    words = [
        "Home",
        "About",
        "Contact",
        "Blog",
        "News",
        "Shop",
        "Cart",
        "Login",
        "Search",
        "Support",
        "FAQ",
        "Terms",
        "Privacy",
        "Account",
        "Sitemap",
        "404",
    ],
    emptyLines = 4,
    textColor = "rgba(255, 255, 255, 0.7)",
    wordsColor = "#FFFFFF",
    backgroundColor,
    font = {
        fontFamily: DEFAULT_FONT_FAMILY,
        fontSize: DEFAULT_FONT_SIZE,
        fontWeight: 400,
        letterSpacing: "0.02em",
    },
    gap = 0,
    reverse = true,
    transition = { type: "tween", duration: 1, ease: "easeInOut", delay: 1 },
    stagger = 0.1,
    loop = true,
    style,
}: TextWallProps) {
    const shouldAnimate = true;
    const fontFamily = font?.fontFamily || DEFAULT_FONT_FAMILY;
    const fontWeight = font?.fontWeight ?? 400;
    const fontStyle = font?.fontStyle ?? "normal";
    const letterSpacing = font?.letterSpacing ?? "0.02em";
    const fontSize = toPx(font?.fontSize, DEFAULT_FONT_SIZE);
    const trDuration =
        typeof transition?.duration === "number" ? transition.duration : 1;
    const trDelay = typeof transition?.delay === "number" ? transition.delay : 0;
    const ease = useMemo(() => makeGsapEase(transition), [transition]);
    const containerRef = useRef<HTMLDivElement>(null);
    const lineRefs = useRef<(HTMLDivElement | null)[]>([]);
    const tweensRef = useRef<any>([]);
    const [animationResetKey, setAnimationResetKey] = useState(0);
    const [charsPerLine, setCharsPerLine] = useState(80);
    const [numLines, setNumLines] = useState(30);
    const [containerWidth, setContainerWidth] = useState(600);
    const cellWidth = containerWidth / Math.max(1, charsPerLine);

    const measureCharWidth = useCallback(() => {
        const sample = ALL_CHARS;
        const tempSpan = document.createElement("span");
        tempSpan.textContent = sample;
        Object.assign(tempSpan.style, {
            position: "absolute",
            visibility: "hidden",
            whiteSpace: "pre",
            lineHeight: "1",
            padding: "0",
            margin: "0",
            fontFamily: String(fontFamily),
            fontSize: `${fontSize}px`,
            fontWeight: String(fontWeight),
            fontStyle: String(fontStyle),
            letterSpacing: String(letterSpacing),
        } as CSSStyleDeclaration);
        document.body.appendChild(tempSpan);
        const rect = tempSpan.getBoundingClientRect();
        document.body.removeChild(tempSpan);
        return rect.width / sample.length || fontSize * 0.6;
    }, [fontSize, fontFamily, fontWeight, fontStyle, letterSpacing]);

    const calculateDimensions = useCallback(() => {
        if (!containerRef.current) return;
        const container = containerRef.current;
        const width = container.clientWidth || container.offsetWidth || 600;
        const height = container.clientHeight || container.offsetHeight || 400;
        const charWidth = measureCharWidth();
        if (charWidth > 0) {
            const calculatedCharsPerLine = Math.floor(width / charWidth);
            setCharsPerLine(Math.max(20, Math.min(400, calculatedCharsPerLine)));
        }
        setContainerWidth(width);
        const lineHeight = fontSize + gap;
        const calculatedNumLines = Math.floor(height / lineHeight);
        setNumLines(Math.max(5, calculatedNumLines));
    }, [fontSize, gap, measureCharWidth]);

    const linesData = useMemo<LineData[]>(() => {
        if (charsPerLine === 0 || numLines === 0) return [];
        const validWords = words.filter(
            (word) => word && word.trim().length > 0
        );
        if (validWords.length === 0) return [];
        const linesWithWords: LineData[] = [];
        const numWords = validWords.length;
        const emptyLineCount = Math.floor((emptyLines / 100) * numLines);
        const startLine = emptyLineCount;
        const endLine = numLines - emptyLineCount;
        const availableLines = Math.max(0, endLine - startLine);
        if (availableLines <= 0) {
            return Array(numLines)
                .fill(null)
                .map(() => ({ wordPositions: [] }));
        }
        const wordsPerLine: string[][] = Array(numLines)
            .fill(null)
            .map(() => []);
        validWords.forEach((word, wordIndex) => {
            let targetLine: number;
            if (numWords === 1) {
                targetLine = startLine + Math.floor(availableLines / 2);
            } else {
                targetLine =
                    startLine +
                    Math.floor(
                        (wordIndex * (availableLines - 1)) / (numWords - 1)
                    );
            }
            const clampedTarget = Math.max(
                startLine,
                Math.min(endLine - 1, targetLine)
            );
            wordsPerLine[clampedTarget].push(word);
        });
        for (let i = 0; i < numLines; i++) {
            const wordsForThisLine = wordsPerLine[i];
            if (wordsForThisLine.length > 0) {
                linesWithWords.push(
                    generateLineDataForWords(wordsForThisLine, charsPerLine)
                );
            } else {
                linesWithWords.push({ wordPositions: [] });
            }
        }
        return linesWithWords;
    }, [words, numLines, charsPerLine, emptyLines]);

    const buildLineContent = useCallback(
        (
            lineData: LineData,
            totalChars: number,
            revealProgress: number,
            settleProgress: number,
            reverseLine: boolean = false
        ) => {
            const numChars = Math.floor(
                mapValue(revealProgress, 0, 1, 0, totalChars)
            );
            const settledChars = Math.floor(
                mapValue(settleProgress, 0, 1, 0, totalChars)
            );
            const cell = `display:inline-block;width:${cellWidth}px;text-align:center;`;
            const isVisible = (i: number) =>
                reverseLine ? i >= totalChars - numChars : i < numChars;
            const isSettled = (i: number) =>
                reverseLine ? i >= totalChars - settledChars : i < settledChars;
            const wordAt = (i: number) =>
                lineData.wordPositions.find(
                    (pos) => i >= pos.start && i < pos.end
                );
            let html = "";
            let i = 0;
            while (i < totalChars) {
                const word = wordAt(i);
                if (word && isVisible(i)) {
                    let end = i;
                    let text = "";
                    while (end < word.end && isVisible(end)) {
                        text += word.word[end - word.start];
                        end++;
                    }
                    const width = (end - i) * cellWidth;
                    html += `<span style="display:inline-block;width:${width}px;white-space:pre;text-align:${
                        reverseLine ? "right" : "left"
                    };color:${wordsColor}">${escapeHtml(text)}</span>`;
                    i = end;
                    continue;
                }
                if (!isVisible(i)) {
                    html += `<span style="${cell}">&nbsp;</span>`;
                    i++;
                    continue;
                }
                const char = isSettled(i)
                    ? "\xa0"
                    : ALL_CHARS[randomInt(0, ALL_CHARS.length - 1)];
                html += `<span style="${cell}color:${textColor}">${escapeHtml(char)}</span>`;
                i++;
            }
            return html;
        },
        [wordsColor, textColor, cellWidth]
    );

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        calculateDimensions();
        const resizeObserver = new ResizeObserver(() => {
            calculateDimensions();
            setAnimationResetKey((prev) => prev + 1);
        });
        resizeObserver.observe(container);
        return () => {
            resizeObserver.disconnect();
        };
    }, [calculateDimensions]);

    useEffect(() => {
        calculateDimensions();
    }, [gap, calculateDimensions]);

    useEffect(() => {
        const fonts: any =
            typeof document !== "undefined" ? (document as any).fonts : null;
        if (!fonts || typeof fonts.ready?.then !== "function") return;
        let cancelled = false;
        let request: Promise<any> = Promise.resolve();
        try {
            request = fonts
                .load(`${fontWeight} ${fontSize}px ${fontFamily}`)
                .catch(() => {});
        } catch {
            // Invalid font shorthand — just wait on fonts.ready below.
        }
        request
            .then(() => fonts.ready)
            .then(() => {
                if (!cancelled) calculateDimensions();
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, [fontSize, fontFamily, fontWeight, calculateDimensions]);

    useEffect(() => {
        tweensRef.current.forEach((tween: any) => tween.kill());
        tweensRef.current = [];
        lineRefs.current.forEach((el) => {
            if (el) {
                el.innerHTML = "";
            }
        });
        if (!shouldAnimate || linesData.length === 0) {
            lineRefs.current.forEach((el, index) => {
                if (el && linesData[index]) {
                    el.innerHTML = buildLineContent(
                        linesData[index],
                        charsPerLine,
                        1,
                        1
                    );
                }
            });
            return;
        }
        const lineStates = linesData.map(() => ({
            revealProgress: 0,
            settleProgress: 0,
        }));
        const numLinesLocal = linesData.length;
        const duration = trDuration;
        const holdDuration = trDelay;

        const updateLine = (index: number) => {
            const lineEl = lineRefs.current[index];
            const lineData = linesData[index];
            if (!lineEl || !lineData) return;
            lineEl.innerHTML = buildLineContent(
                lineData,
                charsPerLine,
                lineStates[index].revealProgress,
                lineStates[index].settleProgress,
                reverse
            );
        };

        const runAnimationCycle = () => {
            const phaseOffset = duration * 0.5;
            const lastLineDelay = (numLinesLocal - 1) * stagger;
            const totalPhaseTime = lastLineDelay + phaseOffset + duration;
            linesData.forEach((_, index) => {
                const lineDelay = index * stagger;
                const revealTween = gsap.to(lineStates[index], {
                    revealProgress: 1,
                    duration: duration,
                    delay: lineDelay,
                    ease,
                    onUpdate: () => updateLine(index),
                });
                tweensRef.current.push(revealTween);
                const settleTween = gsap.to(lineStates[index], {
                    settleProgress: 1,
                    duration: duration,
                    delay: lineDelay + phaseOffset,
                    ease,
                    onUpdate: () => updateLine(index),
                });
                tweensRef.current.push(settleTween);
            });
            if (loop) {
                const reverseStartDelay = totalPhaseTime + holdDuration;
                linesData.forEach((_, index) => {
                    const lineDelay = index * stagger;
                    const hideSettleTween = gsap.to(lineStates[index], {
                        settleProgress: 0,
                        duration: duration,
                        delay: reverseStartDelay + lineDelay,
                        ease,
                        onUpdate: () => updateLine(index),
                    });
                    tweensRef.current.push(hideSettleTween);
                    const hideRevealTween = gsap.to(lineStates[index], {
                        revealProgress: 0,
                        duration: duration,
                        delay: reverseStartDelay + lineDelay + phaseOffset,
                        ease,
                        onUpdate: () => updateLine(index),
                    });
                    tweensRef.current.push(hideRevealTween);
                });
                const totalCycleTime =
                    totalPhaseTime +
                    holdDuration +
                    totalPhaseTime +
                    holdDuration;
                const loopTimeout = setTimeout(() => {
                    lineStates.forEach((state) => {
                        state.revealProgress = 0;
                        state.settleProgress = 0;
                    });
                    tweensRef.current.forEach((tween: any) => tween.kill());
                    tweensRef.current = [];
                    runAnimationCycle();
                }, totalCycleTime * 1e3);
                tweensRef.current.loopTimeout = loopTimeout;
            }
        };

        runAnimationCycle();

        return () => {
            const loopTimeout = tweensRef.current.loopTimeout;
            if (loopTimeout) clearTimeout(loopTimeout);
            tweensRef.current.forEach((tween: any) => tween.kill());
            tweensRef.current = [];
            lineRefs.current.forEach((el) => {
                if (el) {
                    el.innerHTML = "";
                }
            });
        };
    }, [
        shouldAnimate,
        linesData,
        charsPerLine,
        trDuration,
        trDelay,
        ease,
        stagger,
        loop,
        reverse,
        animationResetKey,
        buildLineContent,
    ]);

    return (
        <div
            ref={containerRef}
            style={{
                ...style,
                position: "relative",
                width: "100%",
                height: "100%",
                backgroundColor: backgroundColor || "transparent",
                overflow: "hidden",
            }}
        >
            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    justifyContent: "flex-start",
                    gap: gap,
                    width: "100%",
                    height: "100%",
                }}
            >
                {linesData.map((_, index) => (
                    <div
                        key={index}
                        ref={(el) => {
                            lineRefs.current[index] = el;
                        }}
                        style={{
                            whiteSpace: "pre",
                            fontFamily,
                            fontSize,
                            fontWeight,
                            fontStyle,
                            lineHeight: 1,
                            minHeight: fontSize,
                            width: "100%",
                            textAlign: "left",
                        }}
                    />
                ))}
            </div>
        </div>
    );
}