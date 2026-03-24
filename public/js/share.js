// ─── Share utilities for Cara de Caca ────────────────────────────────────────

// ─── Shared helpers ───────────────────────────────────────────────────────────

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '', lineY = y;
  for (let n = 0; n < words.length; n++) {
    const test = line + words[n] + ' ';
    if (ctx.measureText(test).width > maxWidth && n > 0) {
      ctx.fillText(line.trim(), x, lineY);
      line = words[n] + ' ';
      lineY += lineHeight;
    } else { line = test; }
  }
  ctx.fillText(line.trim(), x, lineY);
  return lineY;
}

function drawRoundRect(ctx, x, y, w, h, r, fill, stroke) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 4; ctx.stroke(); }
}

// Generate a simple QR-code-like grid on canvas (using qrcode lib if loaded, else placeholder)
function drawQR(ctx, text, x, y, size) {
  return new Promise(resolve => {
    if (typeof QRCode !== 'undefined') {
      // Use qrcode.js library
      const tmp = document.createElement('canvas');
      QRCode.toCanvas(tmp, text, { width: size, margin: 1, color: { dark: '#000000', light: '#ffffff' } }, (err) => {
        if (!err) {
          ctx.drawImage(tmp, x, y, size, size);
        } else {
          drawQRPlaceholder(ctx, x, y, size);
        }
        resolve();
      });
    } else {
      drawQRPlaceholder(ctx, x, y, size);
      resolve();
    }
  });
}

function drawQRPlaceholder(ctx, x, y, size) {
  // White background with "QR" text as fallback
  ctx.fillStyle = '#fff';
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = '#333';
  ctx.font = `bold ${size * 0.15}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('Escanea', x + size / 2, y + size / 2 - 10);
  ctx.fillText('el link', x + size / 2, y + size / 2 + 20);
}

// ─── INVITE IMAGE (for lobby - marketing) ─────────────────────────────────────
// 9:16 Instagram Story designed to drive traffic and invite players

async function generateInviteImage({ roomCode, joinUrl, hostName }) {
  const canvas = document.getElementById('share-canvas');
  const W = 1080, H = 1920;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // === BACKGROUND: dark green with radial glow ===
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#081a0e');
  bg.addColorStop(0.4, '#0e3d1f');
  bg.addColorStop(1, '#050f08');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Subtle texture dots
  ctx.globalAlpha = 0.04;
  for (let i = 0; i < 200; i++) {
    ctx.beginPath();
    ctx.arc(Math.random() * W, Math.random() * H, 1 + Math.random() * 3, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Glowing center spotlight
  const spotlight = ctx.createRadialGradient(W / 2, H * 0.38, 0, W / 2, H * 0.38, 500);
  spotlight.addColorStop(0, 'rgba(240,192,64,0.12)');
  spotlight.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = spotlight;
  ctx.fillRect(0, 0, W, H);

  // === TOP BADGE: "TE RETAN A JUGAR" ===
  drawRoundRect(ctx, W / 2 - 320, 80, 640, 90, 45, '#f0c040');
  ctx.fillStyle = '#1a1a1a';
  ctx.font = 'bold 46px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`🎯 ${hostName} TE RETA A JUGAR`, W / 2, 140);

  // === GIANT POOP ===
  ctx.font = '340px sans-serif';
  ctx.textAlign = 'center';
  // Shadow
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 40;
  ctx.fillText('💩', W / 2, 540);
  ctx.shadowBlur = 0;

  // === GAME TITLE ===
  ctx.fillStyle = '#f0c040';
  ctx.font = 'bold 130px "Segoe UI", sans-serif';
  ctx.letterSpacing = '8px';
  ctx.fillText('CARA DE CACA', W / 2, 680);
  ctx.letterSpacing = '0px';

  // Subtitle line
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '48px "Segoe UI", sans-serif';
  ctx.fillText('El juego de cartas más cochino del mundo', W / 2, 750);

  // === ROOM CODE CARD ===
  const cardY = 810, cardH = 260;
  drawRoundRect(ctx, 60, cardY, W - 120, cardH, 28, 'rgba(0,0,0,0.55)');
  // Golden border
  ctx.beginPath();
  ctx.roundRect(60, cardY, W - 120, cardH, 28);
  ctx.strokeStyle = '#f0c040';
  ctx.lineWidth = 5;
  ctx.stroke();

  ctx.fillStyle = 'rgba(240,192,64,0.15)';
  ctx.fillRect(60, cardY, W - 120, cardH);

  ctx.fillStyle = '#aaa';
  ctx.font = '44px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('CÓDIGO DE SALA', W / 2, cardY + 65);

  ctx.fillStyle = '#f0c040';
  ctx.font = 'bold 160px "Courier New", monospace';
  ctx.fillText(roomCode, W / 2, cardY + 210);

  // === HOW TO JOIN ===
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 52px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('¿Cómo unirte?', W / 2, 1140);

  // Step 1
  drawRoundRect(ctx, 60, 1165, W - 120, 115, 16, 'rgba(255,255,255,0.06)');
  ctx.fillStyle = '#f0c040';
  ctx.font = 'bold 52px "Segoe UI", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('1.', 100, 1240);
  ctx.fillStyle = '#fff';
  ctx.font = '48px "Segoe UI", sans-serif';
  ctx.fillText(`Entra a  ${joinUrl.replace('https://', '').split('?')[0]}`, 170, 1240);

  // Step 2
  drawRoundRect(ctx, 60, 1295, W - 120, 115, 16, 'rgba(255,255,255,0.06)');
  ctx.fillStyle = '#f0c040';
  ctx.font = 'bold 52px "Segoe UI", sans-serif';
  ctx.fillText('2.', 100, 1370);
  ctx.fillStyle = '#fff';
  ctx.font = '48px "Segoe UI", sans-serif';
  ctx.fillText('Pon tu nombre → Unirse a partida', 170, 1370);

  // Step 3
  drawRoundRect(ctx, 60, 1425, W - 120, 115, 16, 'rgba(255,255,255,0.06)');
  ctx.fillStyle = '#f0c040';
  ctx.font = 'bold 52px "Segoe UI", sans-serif';
  ctx.fillText('3.', 100, 1500);
  ctx.fillStyle = '#fff';
  ctx.font = '48px "Segoe UI", sans-serif';
  ctx.fillText(`Ingresa el código:  ${roomCode}`, 170, 1500);

  // === QR CODE ===
  const qrSize = 300;
  const qrX = W / 2 - qrSize / 2;
  const qrY = 1570;

  // White background with padding for QR
  drawRoundRect(ctx, qrX - 20, qrY - 20, qrSize + 40, qrSize + 40, 16, '#fff');
  await drawQR(ctx, joinUrl, qrX, qrY, qrSize);

  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = '40px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('O escanea este QR', W / 2, qrY + qrSize + 60);

  // === FOOTER URL ===
  ctx.fillStyle = '#f0c040';
  ctx.font = 'bold 46px "Segoe UI", sans-serif';
  ctx.fillText(joinUrl.replace('https://', ''), W / 2, H - 60);

  return canvas;
}

// ─── RESULT IMAGE (end of game) ───────────────────────────────────────────────

function generateShareImage({ loserName, myName, isLoser, rankings, roomUrl }) {
  const canvas = document.getElementById('share-canvas');
  const W = 1080, H = 1920;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  const grad = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, H);
  grad.addColorStop(0, '#1a6b3a');
  grad.addColorStop(1, '#0a2a15');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  ctx.globalAlpha = 0.08;
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.arc(Math.random()*W, Math.random()*H, 80+Math.random()*200, 0, Math.PI*2);
    ctx.fillStyle = '#fff';
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  ctx.textAlign = 'center';
  ctx.fillStyle = '#f0c040';
  ctx.font = 'bold 100px "Segoe UI", sans-serif';
  ctx.fillText('CARA DE CACA', W/2, 260);

  ctx.font = '280px sans-serif';
  ctx.fillText('💩', W/2, 600);

  ctx.fillStyle = isLoser ? '#ff6b6b' : '#6bffb0';
  ctx.font = 'bold 90px "Segoe UI", sans-serif';
  const resultText = isLoser ? `¡${myName} SE COMIÓ LA CACA!` : `¡${myName} NO SE COMIÓ!`;
  wrapText(ctx, resultText, W/2, 780, W - 120, 110);

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
    ctx.font = i === rankings.length - 1 ? 'bold 55px "Segoe UI", sans-serif' : '55px "Segoe UI", sans-serif';
    ctx.fillStyle = i === rankings.length - 1 ? '#ff6b6b' : '#fff';
    ctx.fillText(r.name, 190, y);
    ctx.fillStyle = '#f0c040';
  });

  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '45px "Segoe UI", sans-serif';
  ctx.fillText('Juega en:', W/2, H - 200);
  ctx.fillStyle = '#f0c040';
  ctx.font = 'bold 50px "Segoe UI", sans-serif';
  ctx.fillText(roomUrl || 'caradecaca.game', W/2, H - 130);

  return canvas;
}

// ─── Sharing ──────────────────────────────────────────────────────────────────

async function shareToInstagram(canvasData, fileName = 'caradecaca.png', shareText = '¡Acabo de jugar Cara de Caca!') {
  return new Promise((resolve, reject) => {
    canvasData.toBlob(async (blob) => {
      if (!blob) return reject(new Error('Canvas empty'));
      const file = new File([blob], fileName, { type: 'image/png' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: '💩 Cara de Caca', text: shareText });
          return resolve('shared');
        } catch (e) { /* cancelled or failed, fallback */ }
      }

      // Fallback: download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
      resolve('downloaded');
    }, 'image/png');
  });
}

window.ShareModule = { generateInviteImage, generateShareImage, shareToInstagram };
