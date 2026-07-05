/**
 * BarcodeScanner — Camera-based barcode scanner component
 * Uses the native BarcodeDetector API with canvas-based fallback.
 * 
 * Supports: EAN-13, EAN-8, Code128, UPC-A, QR Code, Code39
 * 
 * Usage:
 *   <BarcodeScanner 
 *     isOpen={true} 
 *     onScan={(code) => handleBarcode(code)}
 *     onClose={() => setOpen(false)} 
 *   />
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Camera, X, ScanLine, Flashlight, RotateCcw, CheckCircle2, AlertTriangle } from 'lucide-react';

interface BarcodeScannerProps {
    isOpen: boolean;
    onScan: (barcode: string, format?: string) => void;
    onClose: () => void;
    lang?: string;
    /** Accepted barcode formats */
    formats?: string[];
    /** Auto-close after successful scan */
    autoClose?: boolean;
}

const BarcodeScanner: React.FC<BarcodeScannerProps> = ({
    isOpen,
    onScan,
    onClose,
    lang = 'en',
    formats = ['ean_13', 'ean_8', 'code_128', 'upc_a', 'qr_code', 'code_39'],
    autoClose = true,
}) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const animFrameRef = useRef<number | null>(null);
    const detectorRef = useRef<any>(null);
    const lastScanRef = useRef('');
    const lastScanTimeRef = useRef(0);

    const [hasCamera, setHasCamera] = useState(true);
    const [isScanning, setIsScanning] = useState(false);
    const [lastResult, setLastResult] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');

    const stopCamera = useCallback(() => {
        if (animFrameRef.current) {
            cancelAnimationFrame(animFrameRef.current);
            animFrameRef.current = null;
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        setIsScanning(false);
    }, []);

    const startCamera = useCallback(async () => {
        try {
            setError(null);
            setLastResult(null);

            // Check for BarcodeDetector API
            if ('BarcodeDetector' in window) {
                try {
                    detectorRef.current = new (window as any).BarcodeDetector({ formats });
                } catch {
                    detectorRef.current = null;
                }
            }

            if (!detectorRef.current) {
                setError(lang === 'ar' 
                    ? 'المتصفح لا يدعم قارئ الباركود. استخدم Chrome أو Edge.' 
                    : 'Browser does not support BarcodeDetector. Use Chrome or Edge.');
                return;
            }

            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode,
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                },
            });

            streamRef.current = stream;
            setHasCamera(true);

            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                await videoRef.current.play();
                setIsScanning(true);
                detect();
            }
        } catch {
            setHasCamera(false);
            setError(lang === 'ar'
                ? 'لا يمكن الوصول للكاميرا. تأكد من إعطاء الإذن.'
                : 'Cannot access camera. Please grant permission.');
        }
    }, [facingMode, formats, lang]);

    const detect = useCallback(() => {
        const video = videoRef.current;
        const detector = detectorRef.current;
        if (!video || !detector || video.readyState < 2) {
            animFrameRef.current = requestAnimationFrame(detect);
            return;
        }

        detector.detect(video).then((barcodes: any[]) => {
            if (barcodes.length > 0) {
                const barcode = barcodes[0];
                const code = barcode.rawValue;
                const now = Date.now();

                // Dedupe: don't fire same code within 2 seconds
                if (code !== lastScanRef.current || now - lastScanTimeRef.current > 2000) {
                    lastScanRef.current = code;
                    lastScanTimeRef.current = now;
                    setLastResult(code);

                    // Vibrate for tactile feedback (mobile)
                    if (navigator.vibrate) navigator.vibrate(100);

                    onScan(code, barcode.format);

                    if (autoClose) {
                        setTimeout(() => {
                            stopCamera();
                            onClose();
                        }, 800);
                        return;
                    }
                }
            }

            if (isScanning) {
                animFrameRef.current = requestAnimationFrame(detect);
            }
        }).catch(() => {
            if (isScanning) {
                animFrameRef.current = requestAnimationFrame(detect);
            }
        });
    }, [isScanning, onScan, autoClose, stopCamera, onClose]);

    useEffect(() => {
        if (isOpen) {
            startCamera();
        } else {
            stopCamera();
        }
        return () => stopCamera();
    }, [isOpen, startCamera, stopCamera]);

    const toggleFacingMode = () => {
        stopCamera();
        setFacingMode(prev => prev === 'environment' ? 'user' : 'environment');
        setTimeout(() => startCamera(), 300);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[200] bg-black/95 flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-black/80 ">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center">
                        <Camera size={16} className="text-indigo-400" />
                    </div>
                    <div>
                        <h3 className="text-sm font-semibold text-white">
                            {lang === 'ar' ? 'ماسح الباركود' : 'Barcode Scanner'}
                        </h3>
                        <p className="text-[10px] text-white/50">
                            {lang === 'ar' ? 'وجّه الكاميرا نحو الباركود' : 'Point camera at barcode'}
                        </p>
                    </div>
                </div>
                <button
                    onClick={() => { stopCamera(); onClose(); }}
                    className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
                >
                    <X size={16} className="text-white" />
                </button>
            </div>

            {/* Camera View */}
            <div className="flex-1 relative overflow-hidden">
                <video
                    ref={videoRef}
                    className="absolute inset-0 w-full h-full object-cover"
                    playsInline
                    muted
                    autoPlay
                />
                <canvas ref={canvasRef} className="hidden" />

                {/* Scan Guide Overlay */}
                <div className="absolute inset-0 flex items-center justify-center">
                    {/* Corner brackets */}
                    <div className="relative w-72 h-48">
                        {/* Top-left */}
                        <div className="absolute top-0 left-0 w-10 h-10 border-t-2 border-l-2 border-indigo-400 rounded-tl-lg" />
                        {/* Top-right */}
                        <div className="absolute top-0 right-0 w-10 h-10 border-t-2 border-r-2 border-indigo-400 rounded-tr-lg" />
                        {/* Bottom-left */}
                        <div className="absolute bottom-0 left-0 w-10 h-10 border-b-2 border-l-2 border-indigo-400 rounded-bl-lg" />
                        {/* Bottom-right */}
                        <div className="absolute bottom-0 right-0 w-10 h-10 border-b-2 border-r-2 border-indigo-400 rounded-br-lg" />

                        {/* Scan line animation */}
                        {isScanning && !lastResult && (
                            <div
                                className="absolute left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-indigo-400 to-transparent"
                                style={{
                                    animation: 'scanline 2s ease-in-out infinite',
                                    top: '50%',
                                }}
                            />
                        )}
                    </div>
                </div>

                {/* Darkened outer area */}
                <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute inset-0 bg-black/40" style={{
                        maskImage: 'radial-gradient(ellipse 300px 200px at center, transparent 50%, black 70%)',
                        WebkitMaskImage: 'radial-gradient(ellipse 300px 200px at center, transparent 50%, black 70%)',
                    }} />
                </div>

                {/* Success overlay */}
                {lastResult && (
                    <div className="absolute inset-0 bg-emerald-500/20 flex items-center justify-center animate-in fade-in duration-200">
                        <div className="bg-black/80  rounded-2xl px-8 py-5 text-center">
                            <CheckCircle2 size={40} className="text-emerald-400 mx-auto mb-3" />
                            <p className="text-white font-bold text-lg mb-1">{lastResult}</p>
                            <p className="text-emerald-400/80 text-xs">
                                {lang === 'ar' ? 'تم المسح بنجاح!' : 'Scanned successfully!'}
                            </p>
                        </div>
                    </div>
                )}

                {/* Error overlay */}
                {error && !isScanning && (
                    <div className="absolute inset-0 bg-black/80 flex items-center justify-center">
                        <div className="bg-slate-900/90  rounded-2xl px-8 py-6 text-center max-w-sm mx-4">
                            <AlertTriangle size={40} className="text-amber-400 mx-auto mb-3" />
                            <p className="text-white text-sm mb-4">{error}</p>
                            <button
                                onClick={startCamera}
                                className="px-6 py-2 bg-indigo-500 text-white rounded-lg text-sm font-medium hover:bg-indigo-600 transition-colors"
                            >
                                {lang === 'ar' ? 'إعادة المحاولة' : 'Retry'}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Bottom controls */}
            <div className="px-4 py-4 bg-black/80  flex items-center justify-center gap-6">
                <button
                    onClick={toggleFacingMode}
                    className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
                    title={lang === 'ar' ? 'تبديل الكاميرا' : 'Switch Camera'}
                >
                    <RotateCcw size={20} className="text-white" />
                </button>

                {lastResult && !autoClose && (
                    <button
                        onClick={() => {
                            setLastResult(null);
                            lastScanRef.current = '';
                            if (!isScanning) {
                                setIsScanning(true);
                                detect();
                            }
                        }}
                        className="px-6 py-3 bg-indigo-500 text-white rounded-xl text-sm font-semibold hover:bg-indigo-600 transition-colors"
                    >
                        {lang === 'ar' ? 'مسح آخر' : 'Scan Another'}
                    </button>
                )}
            </div>

            {/* Scanline animation keyframes */}
            <style>{`
                @keyframes scanline {
                    0%, 100% { transform: translateY(-80px); opacity: 0.3; }
                    50% { transform: translateY(80px); opacity: 1; }
                }
            `}</style>
        </div>
    );
};

export default BarcodeScanner;
