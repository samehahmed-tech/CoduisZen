// Image Uploader Component
// Handles image selection, preview, upload with smart compression

import React, { useRef, useState } from 'react';
import { Upload, X, Loader2, Check, AlertCircle } from 'lucide-react';
import { uploadImage, validateImageFile, formatFileSize, ImagePresetType, IMAGE_PRESETS } from '../../services/imageService';

interface ImageUploaderProps {
    value?: string;
    onChange: (url: string) => void;
    type?: ImagePresetType;
    className?: string;
    label?: string;
    lang?: 'en' | 'ar';
    showDetails?: boolean;
}

const ImageUploader: React.FC<ImageUploaderProps> = ({
    value,
    onChange,
    type = 'other' as ImagePresetType,
    className = '',
    label,
    lang = 'ar',
    showDetails = false,
}) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [uploadInfo, setUploadInfo] = useState<{ size: number; width: number; height: number } | null>(null);
    const [isDragging, setIsDragging] = useState(false);

    const preset = IMAGE_PRESETS[type];

    const handleFileSelect = async (file: File) => {
        // Validate file
        const validation = validateImageFile(file);
        if (!validation.valid) {
            setError(validation.error || 'Invalid file');
            return;
        }

        setIsLoading(true);
        setError(null);
        setUploadInfo(null);

        try {
            const result = await uploadImage(file, type);
            onChange(result.url);
            setUploadInfo({ size: result.size, width: result.width, height: result.height });
        } catch (err: any) {
            setError(err.message || (lang === 'ar' ? 'فشل رفع الصورة' : 'Upload failed'));
        } finally {
            setIsLoading(false);
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) handleFileSelect(file);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) handleFileSelect(file);
    };

    const handleRemove = () => {
        onChange('');
        setUploadInfo(null);
        if (inputRef.current) inputRef.current.value = '';
    };

    return (
        <div className={`relative ${className}`}>
            {label && (
                <label className="block text-[10px] font-black text-muted uppercase tracking-widest mb-2">
                    {label}
                    <span className="text-muted/50 font-normal mx-1">•</span>
                    <span className="text-muted/70 font-normal">{preset.width}×{preset.height}px</span>
                </label>
            )}

            <div className="flex items-stretch gap-3">
                {/* Upload Area */}
                <div
                    onClick={() => !isLoading && inputRef.current?.click()}
                    onDrop={handleDrop}
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    className={`
                        w-24 h-24 rounded-2xl overflow-hidden cursor-pointer
                        flex items-center justify-center transition-all relative
                        border-2
                        ${isDragging
                            ? 'border-primary bg-primary/10 scale-105'
                            : value
                                ? 'border-transparent'
                                : 'border-dashed border-border hover:border-primary bg-elevated/50'
                        }
                        ${isLoading ? 'pointer-events-none' : ''}
                    `}
                >
                    {isLoading ? (
                        <div className="flex flex-col items-center gap-2">
                            <Loader2 className="w-6 h-6 text-primary animate-spin" />
                            <span className="text-[8px] font-bold text-muted">
                                {lang === 'ar' ? 'جاري الضغط...' : 'Compressing...'}
                            </span>
                        </div>
                    ) : value ? (
                        <>
                            <img
                                src={value}
                                alt="Preview"
                                className="w-full h-full object-cover"
                            />
                            {/* Success overlay */}
                            <div className="absolute bottom-1 right-1 w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg">
                                <Check size={12} className="text-white" />
                            </div>
                        </>
                    ) : (
                        <div className="text-center p-2">
                            <Upload className={`w-6 h-6 mx-auto mb-1 ${isDragging ? 'text-primary' : 'text-muted'}`} />
                            <span className="text-[8px] font-bold text-muted uppercase block">
                                {lang === 'ar' ? 'اسحب أو اختر' : 'Drop or Click'}
                            </span>
                        </div>
                    )}
                </div>

                {/* Controls + URL Input */}
                <div className="flex-1 flex flex-col gap-2">
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={value || ''}
                            onChange={(e) => {
                                onChange(e.target.value);
                                setUploadInfo(null);
                            }}
                            placeholder={lang === 'ar' ? 'او الصق رابط الصورة' : 'or paste image URL'}
                            className="theme-input flex-1 p-3 rounded-xl text-xs font-mono border outline-none transition-all"
                        />
                        {value && (
                            <button
                                type="button"
                                onClick={handleRemove}
                                className="p-3 rounded-xl bg-rose-100 dark:bg-rose-900/20 text-rose-500 hover:bg-rose-200 dark:hover:bg-rose-900/40 transition-all"
                            >
                                <X size={16} />
                            </button>
                        )}
                    </div>

                    {/* Upload Info */}
                    {showDetails && uploadInfo && (
                        <div className="flex gap-3 text-[9px] font-bold text-muted">
                            <span>{uploadInfo.width}×{uploadInfo.height}px</span>
                            <span>•</span>
                            <span>{formatFileSize(uploadInfo.size)}</span>
                        </div>
                    )}

                    {/* Preset Info */}
                    {!value && !error && (
                        <p className="text-[9px] text-muted">
                            {lang === 'ar'
                                ? `سيتم ضغط الصورة تلقائياً إلى ${preset.width}×${preset.height} بكسل`
                                : `Auto-compressed to ${preset.width}×${preset.height}px`
                            }
                        </p>
                    )}
                </div>
            </div>

            {/* Hidden File Input */}
            <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={handleInputChange}
                className="hidden"
            />

            {/* Error Message */}
            {error && (
                <div className="flex items-center gap-2 mt-2 p-2 bg-rose-50 dark:bg-rose-900/10 rounded-lg">
                    <AlertCircle size={14} className="text-rose-500 flex-shrink-0" />
                    <p className="text-[10px] text-rose-500 font-bold">{error}</p>
                </div>
            )}
        </div>
    );
};

export default ImageUploader;
