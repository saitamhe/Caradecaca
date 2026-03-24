// Instagram Story share generator (9:16 canvas)
function generateShareImage({ loserName, myName, isLoser, rankings, roomUrl }) {
  const canvas = document.getElementById('share-canvas');
  const W = 1080, H = 1920;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Background gradient
  const grad = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, H);
  grad.addColorStop(0, '#1a6b3a');
  grad.addColorStop(1, '#0a2a15');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Decorative circles
  ctx.globalAlpha = 0.08;
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.arc(Math.random()*W, Math.random()*H, 80+Math.random()*200, 0, Math.PI*2);
    ctx.fillStyle = '#fff';
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Title
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f0c040';
  ctx.font = 'bold 100px "Segoe UI", sans-serif';
  ctx.fillText('CARA DE CACA', W/2, 260);

  // Poop emoji
  ctx.font = '280px sans-serif';
  ctx.fillText('💩', W/2, 600);

  // Main result
  ctx.fillStyle = isLoser ? '#ff6b6b' : '#6bffb0';
  ctx.font = 'bold 90px "Segoe UI", sans-serif';
  const resultText = isLoser
    ? `¡${myName} SE COMIÓ LA CACA!`
    : `¡${myName} NO SE COMIÓ!`;

  // Word wrap
  wrapText(ctx, resultText, W/2, 780, W - 120, 110);

  // Rankings
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.roundRect(80, 950, W - 160, rankings.length * 90 + 40, 20);
  ctx.fill();

  ctx.textAlign = 'left';
  ctx.fillStyle = '#f0c040';
  ctx.font = 'bold 55px "Segoe UI", sans-serif';
  ctx.fillText('Resultados:', 130, 1010);

  const medals = ['🏆', '🥈', '🥉'];
  rankings.forEach((r, i) => {
    const y = 1090 + i * 90;
    const medal = i < rankings.length - 1 ? (medals[i] || `${i+1}.`) : '💩';
    ctx.font = '55px sans-serif';
    ctx.fillText(medal, 110, y);
    ctx.font = i === rankings.length - 1
      ? 'bold 55px "Segoe UI", sans-serif'
      : '55px "Segoe UI", sans-serif';
    ctx.fillStyle = i === rankings.length - 1 ? '#ff6b6b' : '#fff';
    ctx.fillText(r.name, 190, y);
    ctx.fillStyle = '#f0c040';
  });

  // Footer
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '45px "Segoe UI", sans-serif';
  ctx.fillText('Juega en:', W/2, H - 200);
  ctx.fillStyle = '#f0c040';
  ctx.font = 'bold 50px "Segoe UI", sans-serif';
  ctx.fillText(roomUrl || 'caradecaca.game', W/2, H - 130);

  return canvas;
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  let lineY = y;
  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    if (ctx.measureText(testLine).width > maxWidth && n > 0) {
      ctx.fillText(line.trim(), x, lineY);
      line = words[n] + ' ';
      lineY += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line.trim(), x, lineY);
}

async function shareToInstagram(canvasData) {
  return new Promise((resolve, reject) => {
    canvasData.toBlob(async (blob) => {
      if (!blob) return reject(new Error('Canvas empty'));
      const file = new File([blob], 'caradecaca.png', { type: 'image/png' });

      // Try Web Share API (mobile)
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: '💩 Cara de Caca',
            text: '¡Acabo de jugar Cara de Caca!'
          });
          return resolve('shared');
        } catch (e) {
          // User cancelled or share failed, fallback to download
        }
      }

      // Fallback: download image
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'caradecaca-resultado.png';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
      resolve('downloaded');
    }, 'image/png');
  });
}

window.ShareModule = { generateShareImage, shareToInstagram };
