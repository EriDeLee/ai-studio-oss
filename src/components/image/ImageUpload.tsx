import { useState } from 'react';
import { cn } from '../../lib/utils';
import { Upload, X } from 'lucide-react';

interface ImageUploadProps {
  value?: string;
  onChange: (base64: string, file: File) => void;
  onClear?: () => void;
  accept?: string;
  className?: string;
  placeholder?: string;
}

export function ImageUpload({
  value,
  onChange,
  onClear,
  accept = 'image/*',
  className,
  placeholder = '点击或拖拽上传图片',
}: ImageUploadProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleFile = async (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      onChange(base64, file);
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      handleFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
  };

  return (
    <div
      className={cn(
        'relative border-2 border-dashed rounded-lg transition-colors',
        isDragging
          ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
          : 'border-gray-300 dark:border-gray-600',
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
              onClick={onClear}
              className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
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
          />
        </label>
      )}
    </div>
  );
}
