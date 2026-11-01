// 사진 줄이기. 내 품목 대표 사진(F-19)과 연습 기록 사진(F-10)에 같이 쓴다. (prd 5.3)
// 긴 변을 1200px로 줄인 JPG를 data URL(글자로 바꾼 사진)로 돌려줘서 IndexedDB에 그대로 저장할 수 있다.

export const MAX_SIDE = 1200;
export const ACCEPT_TYPES = ['image/jpeg', 'image/png'];

async function loadImage(file) {
  // 휴대폰 사진의 회전 정보(EXIF)를 반영해서 연다
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      // 지원하지 않으면 아래 방법으로 연다
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('사진을 열지 못했어요.'));
    };
    img.src = url;
  });
}

/**
 * 사진 파일을 긴 변 maxSide(px) 이하의 JPG data URL로 바꾼다. 원래 더 작으면 크기는 그대로 둔다.
 * JPG·PNG가 아니면 오류를 낸다.
 */
export async function resizeImage(file, maxSide = MAX_SIDE, quality = 0.85) {
  if (!ACCEPT_TYPES.includes(file.type)) {
    throw new Error('JPG나 PNG 사진만 올릴 수 있어요.');
  }

  const image = await loadImage(file);
  const width = image.width;
  const height = image.height;
  const scale = Math.min(1, maxSide / Math.max(width, height));

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#FFFFFF'; // PNG의 투명한 부분은 흰색으로
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  if (image.close) image.close();

  return canvas.toDataURL('image/jpeg', quality);
}
