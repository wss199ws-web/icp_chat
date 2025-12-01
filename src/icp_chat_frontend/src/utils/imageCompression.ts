/**
 * 图片压缩工具
 * 当图片超过2MB，自动压缩到1MB以内
 */

const MAX_SIZE_BEFORE_COMPRESS = 2 * 1024 * 1024; // 2MB
const TARGET_SIZE = 1 * 1024 * 1024; // 1MB
const MAX_QUALITY = 0.95;
const MIN_QUALITY = 0.1;
const QUALITY_STEP = 0.1;

/**
 * 压缩图片
 * @param file 原始图片文件
 * @param maxSize 目标最大大小（字节），默认1MB
 * @returns 压缩后的Blob
 */
export async function compressImage(
  file: File,
  maxSize: number = TARGET_SIZE
): Promise<Blob> {
  // 如果文件小于2MB，直接返回
  if (file.size <= MAX_SIZE_BEFORE_COMPRESS) {
    return file;
  }

  console.log(`[ImageCompression] 开始压缩图片，原始大小: ${(file.size / 1024 / 1024).toFixed(2)}MB`);

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        // 计算压缩后的尺寸（保持宽高比）
        let width = img.width;
        let height = img.height;
        
        // 如果图片很大，先缩小尺寸
        const maxDimension = 1920; // 最大宽度或高度
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = (height * maxDimension) / width;
            width = maxDimension;
          } else {
            width = (width * maxDimension) / height;
            height = maxDimension;
          }
        }

        // 使用Canvas压缩
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          reject(new Error('无法创建Canvas上下文'));
          return;
        }

        // 绘制图片
        ctx.drawImage(img, 0, 0, width, height);

        // 尝试不同的质量值，直到文件大小符合要求
        const tryCompress = (quality: number): void => {
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error('压缩失败'));
                return;
              }

              // 如果文件大小符合要求，或者质量已经很低了，返回结果
              if (blob.size <= maxSize || quality <= MIN_QUALITY) {
                console.log(
                  `[ImageCompression] 压缩完成，最终大小: ${(blob.size / 1024 / 1024).toFixed(2)}MB, 质量: ${quality.toFixed(2)}`
                );
                resolve(blob);
              } else {
                // 继续降低质量
                const newQuality = Math.max(quality - QUALITY_STEP, MIN_QUALITY);
                tryCompress(newQuality);
              }
            },
            file.type || 'image/jpeg',
            quality
          );
        };

        // 从最高质量开始尝试
        tryCompress(MAX_QUALITY);
      };

      img.onerror = () => {
        reject(new Error('图片加载失败'));
      };

      if (typeof e.target?.result === 'string') {
        img.src = e.target.result;
      } else if (e.target?.result instanceof ArrayBuffer) {
        const blob = new Blob([e.target.result], { type: file.type });
        img.src = URL.createObjectURL(blob);
      } else {
        reject(new Error('无法读取文件'));
      }
    };

    reader.onerror = () => {
      reject(new Error('文件读取失败'));
    };

    reader.readAsDataURL(file);
  });
}

/**
 * 压缩图片并返回Data URL（用于预览）
 * @param file 原始图片文件
 * @param maxSize 目标最大大小（字节），默认1MB
 * @returns 压缩后的Data URL
 */
export async function compressImageToDataURL(
  file: File,
  maxSize: number = TARGET_SIZE
): Promise<string> {
  const compressedBlob = await compressImage(file, maxSize);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('无法生成Data URL'));
      }
    };
    reader.onerror = () => {
      reject(new Error('读取压缩后的图片失败'));
    };
    reader.readAsDataURL(compressedBlob);
  });
}

