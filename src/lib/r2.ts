export async function uploadToR2(file: Blob, fileName: string, contentType: string) {
  try {
    // 1. Get presigned URL from our backend
    const response = await fetch('/api/r2/presign', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fileName, contentType }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to get presigned URL');
    }

    const { signedUrl, publicUrl } = await response.json();

    // 2. Upload directly to R2 using the presigned URL
    const uploadResponse = await fetch(signedUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
      },
      body: file,
    });

    if (!uploadResponse.ok) {
      throw new Error('Failed to upload to R2');
    }

    return publicUrl;
  } catch (error) {
    console.error('R2 Upload Error:', error);
    throw error;
  }
}
