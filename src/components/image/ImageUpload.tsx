import { useState } from 'react';
import { cn } from '../../lib/utils';
import { Upload, X, Plus } from 'lucide-react';

interface ImageUploadProps {
  /** Single image mode: value is a base64 string. Multi-image mode omitted. */
  value?: string;
  onChange: (base64: string, file: File) => void;
  onClear?: () => void;
  accept?: string;
  className?: string;
  placeholder?: string;
  maxSizeMB?: number;
}

interface MultiImageUploadProps {
  /** Multi-image mode: value is an array of base64 strings */
  values: string[];
  onChange: (base64Array: string[], files: File[]) => void;
  onClear?: () => void;
  accept?: string;
  className?: string;
  placeholder?: string;
  maxSizeMB?: number;
  maxImages?: number;
}

export type ImageUploadComponentProps = ImageUploadProps | MultiImageUploadProps;

const isValidImageFile = (file: File): boolean => {
  return file.type.startsWith('image/') && file.size > 0;
};

const readFileAsBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('图片读取失败'));
    reader.readAsDataURL(file);
  });
};

/**
 * Single image upload component
 */
export function ImageUpload({
  value,
  onChange,
  onClear,
  accept = 'image/*',
  className,
  placeholder = '点击或拖拽上传图片',
  maxSizeMB = 10,
}: ImageUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setError(null);

    if (!isValidImageFile(file)) {
      setError('请选择有效的图片文件');
      return;
    }

    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      setError(`图片大小不能超过 ${maxSizeMB}MB`);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      onChange(base64, file);
    };
    reader.onerror = () => {
      setError('图片读取失败，请重试');
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      handleFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
    e.target.value = '';
  };

  return (
    <div className="space-y-2">
      <div
        className={cn(
          'relative border-2 border-dashed rounded-lg transition-colors',
          isDragging
            ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
            : 'border-gray-300 dark:border-gray-600',
          error && 'border-red-500 bg-red-50 dark:bg-red-900/10',
          className
        )}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        {value ? (
          <div className="relative aspect-square">
            <img
              src={value}
              alt="Uploaded"
              className="w-full h-full object-cover rounded-lg"
            />
            {onClear && (
              <button
                type="button"
                onClick={() => {
                  onClear();
                  setError(null);
                }}
                className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                aria-label="清除图片"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        ) : (
          <label className="flex flex-col items-center justify-center aspect-square cursor-pointer p-4">
            <Upload className="w-8 h-8 text-gray-400 mb-2" />
            <span className="text-sm text-gray-500 dark:text-gray-400 text-center">
              {placeholder}
            </span>
            <input
              type="file"
              accept={accept}
              onChange={handleInputChange}
              className="hidden"
              aria-label="上传图片"
            />
          </label>
        )}
      </div>
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Multi-image upload component with thumbnail list
 */
export function MultiImageUpload({
  values = [],
  onChange,
  accept = 'image/*',
  className,
  placeholder = '点击或拖拽上传图片',
  maxSizeMB = 10,
  maxImages = 5,
}: Omit<MultiImageUploadProps, 'onClear'> & { onClear?: () => void }) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFiles = async (files: FileList | File[]) => {
    setError(null);

    const remainingSlots = maxImages - values.length;
    if (remainingSlots <= 0) {
      setError(`最多只能上传 ${maxImages} 张图片`);
      return;
    }

    const filesToProcess = Array.from(files).slice(0, remainingSlots);
    const validFiles: File[] = [];
    const base64Results: string[] = [];

    for (const file of filesToProcess) {
      if (!isValidImageFile(file)) {
        setError('请选择有效的图片文件');
        return;
      }

      const maxSizeBytes = maxSizeMB * 1024 * 1024;
      if (file.size > maxSizeBytes) {
        setError(`图片大小不能超过 ${maxSizeMB}MB`);
        return;
      }

      try {
        const base64 = await readFileAsBase64(file);
        validFiles.push(file);
        base64Results.push(base64);
      } catch {
        setError('图片读取失败，请重试');
        return;
      }
    }

    const newValues = [...values, ...base64Results];
    // We need to track files externally; for simplicity, we pass base64 array only
    onChange(newValues, validFiles);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      handleFiles(files);
    }
    e.target.value = '';
  };

  const removeImage = (index: number) => {
    const newValues = values.filter((_, i) => i !== index);
    onChange(newValues, []);
  };

  const canAddMore = values.length < maxImages;

  return (
    <div className="space-y-3">
      {/* Thumbnail list */}
      {values.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {values.map((base64, index) => (
            <div key={index} className="relative w-20 h-20 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
              <img
                src={base64}
                alt={`参考图 ${index + 1}`}
                className="w-full h-full object-cover"
              />
              <button
                type="button"
                onClick={() => removeImage(index)}
                className="absolute top-0.5 right-0.5 p-0.5 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                aria-label={`删除参考图 ${index + 1}`}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Upload area */}
      {canAddMore && (
        <div
          className={cn(
            'relative border-2 border-dashed rounded-lg transition-colors p-4',
            isDragging
              ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
              : 'border-gray-300 dark:border-gray-600',
            error && 'border-red-500 bg-red-50 dark:bg-red-900/10',
            className
          )}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <label className="flex flex-col items-center justify-center cursor-pointer">
            {values.length > 0 ? (
              <Plus className="w-6 h-6 text-gray-400 mb-1" />
            ) : (
              <Upload className="w-8 h-8 text-gray-400 mb-2" />
            )}
            <span className="text-sm text-gray-500 dark:text-gray-400 text-center">
              {values.length > 0 ? '添加更多' : placeholder}
              {maxImages > 1 && (
                <span className="ml-1 text-xs text-gray-400">
                  ({values.length}/{maxImages})
                </span>
              )}
            </span>
            <input
              type="file"
              accept={accept}
              multiple
              onChange={handleInputChange}
              className="hidden"
              aria-label="上传图片"
            />
          </label>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
