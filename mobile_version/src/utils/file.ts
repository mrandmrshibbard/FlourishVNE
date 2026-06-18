export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    const sizeMB = file.size / 1024 / 1024;
    
    // Log file info
    console.log('[FileReader] Reading file:', {
      name: file.name,
      size: file.size,
      sizeMB: sizeMB.toFixed(2) + ' MB',
      type: file.type
    });
    
    // Warn for very large files (over 50MB)
    if (sizeMB > 50) {
      console.warn(`[FileReader] WARNING: Large file detected (${sizeMB.toFixed(2)} MB). This may cause performance issues.`);
      const userConfirmed = confirm(
        `The file "${file.name}" is ${sizeMB.toFixed(1)} MB, which is quite large.\n\n` +
        `Large video files may:\n` +
        `• Take a long time to upload and save\n` +
        `• Cause the app to slow down or crash\n` +
        `• Make exported projects very large\n\n` +
        `For better performance, consider:\n` +
        `• Compressing the video\n` +
        `• Reducing resolution (e.g., 720p instead of 1080p)\n` +
        `• Shortening the video duration\n\n` +
        `Do you want to continue uploading this file?`
      );
      if (!userConfirmed) {
        reject(new Error('Upload cancelled by user'));
        return;
      }
    }
    
    reader.readAsDataURL(file);
    
    reader.onload = () => {
      const result = reader.result as string;
      console.log('[FileReader] Success:', {
        name: file.name,
        resultLength: result.length,
        resultSizeMB: (result.length / 1024 / 1024).toFixed(2) + ' MB',
        resultPreview: result.substring(0, 100)
      });
      resolve(result);
    };
    
    reader.onerror = (error) => {
      console.error('[FileReader] Error reading file:', file.name, error);
      reject(error);
    };
    
    reader.onabort = () => {
      console.error('[FileReader] File reading aborted:', file.name);
      reject(new Error('File reading aborted'));
    };
  });
};
