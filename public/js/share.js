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
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const cx = W / 2;

  // ── BACKGROUND: near-black with subtle vignette ──
  ctx.fillStyle = '#0a0f0b';
  ctx.fillRect(0, 0, W, H);

  // Subtle green radial glow in center
  const centerGlow = ctx.createRadialGradient(cx, H * 0.42, 0, cx, H * 0.42, 600);
  centerGlow.addColorStop(0, 'rgba(20,90,45,0.45)');
  centerGlow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = centerGlow;
  ctx.fillRect(0, 0, W, H);

  // Scattered poop emojis (background, very faint)
  ctx.globalAlpha = 0.07;
  ctx.font = '80px sans-serif';
  const bgEmojis = ['💩','💩','🔥','💩','💀','💩','🔥','💩'];
  const bgPos = [
    [90,200],[950,340],[60,750],[980,620],[120,1100],[920,980],[80,1450],[970,1300]
  ];
  bgPos.forEach(([x,y], i) => { ctx.fillText(bgEmojis[i], x, y); });
  ctx.globalAlpha = 1;

  // ── NEON BORDER ──
  const bw = 18; // border width
  // Left + right: neon green
  const neonGreen = '#00ff6a';
  const neonPink  = '#ff2d6a';
  // Top bar — green
  ctx.shadowColor = neonGreen; ctx.shadowBlur = 28;
  ctx.strokeStyle = neonGreen; ctx.lineWidth = bw;
  ctx.beginPath();
  ctx.moveTo(bw/2, bw/2); ctx.lineTo(W - bw/2, bw/2);
  ctx.stroke();
  // Bottom bar — pink
  ctx.shadowColor = neonPink; ctx.shadowBlur = 28;
  ctx.strokeStyle = neonPink; ctx.lineWidth = bw;
  ctx.beginPath();
  ctx.moveTo(bw/2, H - bw/2); ctx.lineTo(W - bw/2, H - bw/2);
  ctx.stroke();
  // Left — green
  ctx.shadowColor = neonGreen; ctx.shadowBlur = 28;
  ctx.strokeStyle = neonGreen; ctx.lineWidth = bw;
  ctx.beginPath();
  ctx.moveTo(bw/2, bw/2); ctx.lineTo(bw/2, H - bw/2);
  ctx.stroke();
  // Right — pink
  ctx.shadowColor = neonPink; ctx.shadowBlur = 28;
  ctx.strokeStyle = neonPink; ctx.lineWidth = bw;
  ctx.beginPath();
  ctx.moveTo(W - bw/2, bw/2); ctx.lineTo(W - bw/2, H - bw/2);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // ── TITLE: CARA DE CACA ──
  ctx.textAlign = 'center';
  ctx.shadowColor = neonGreen; ctx.shadowBlur = 35;
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 128px "Segoe UI", Arial Black, sans-serif';
  ctx.fillText('CARA DE CACA', cx, 190);
  ctx.shadowBlur = 0;

  // Accent line under title
  const lineGrad = ctx.createLinearGradient(120, 0, W-120, 0);
  lineGrad.addColorStop(0, 'transparent');
  lineGrad.addColorStop(0.3, neonGreen);
  lineGrad.addColorStop(0.7, neonPink);
  lineGrad.addColorStop(1, 'transparent');
  ctx.strokeStyle = lineGrad;
  ctx.lineWidth = 4;
  ctx.shadowColor = neonGreen; ctx.shadowBlur = 10;
  ctx.beginPath(); ctx.moveTo(120, 215); ctx.lineTo(W-120, 215); ctx.stroke();
  ctx.shadowBlur = 0;

  // ── GIANT POOP EMOJI ──
  ctx.shadowColor = 'rgba(255,80,0,0.7)'; ctx.shadowBlur = 60;
  ctx.font = '320px sans-serif';
  ctx.fillText('💩', cx, 620);
  ctx.shadowBlur = 0;

  // Small emojis floating around poop
  const floatEmojis = [
    ['😂', cx - 320, 370, '90px'],
    ['💀', cx + 300, 400, '80px'],
    ['🔥', cx - 280, 540, '75px'],
    ['👑', cx + 260, 500, '85px'],
    ['😱', cx - 250, 650, '70px'],
    ['👎', cx + 320, 620, '70px'],
  ];
  floatEmojis.forEach(([em, x, y, fs]) => {
    ctx.font = `${fs} sans-serif`;
    ctx.globalAlpha = 0.85;
    ctx.fillText(em, x, y);
  });
  ctx.globalAlpha = 1;

  // ── RESULT TEXT ──
  const loserDisplayName = loserName.toUpperCase();
  ctx.textAlign = 'center';

  if (isLoser) {
    // Player lost — big red shame text
    ctx.shadowColor = '#ff0040'; ctx.shadowBlur = 30;
    ctx.fillStyle = neonPink;
    ctx.font = 'bold 100px "Segoe UI", sans-serif';
    ctx.fillText('¡YO ME LA COMÍ!', cx, 800);
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = '58px "Segoe UI", sans-serif';
    ctx.fillText(`${myName} = CARA DE CACA 💩`, cx, 880);
  } else {
    // Player won
    ctx.shadowColor = neonGreen; ctx.shadowBlur = 30;
    ctx.fillStyle = '#00ff6a';
    ctx.font = 'bold 96px "Segoe UI", sans-serif';
    ctx.fillText('¡ME SALVÉ! 🏆', cx, 800);
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '54px "Segoe UI", sans-serif';
    wrapText(ctx, `${loserDisplayName} SE COMIÓ TODA LA CACA`, cx, 878, W - 140, 68);
  }

  // ── RESULTS CARD ──
  const cardY = 950;
  const cardH = Math.max(rankings.length * 96 + 120, 240);

  // Card background with neon border
  ctx.shadowColor = 'rgba(0,255,106,0.3)'; ctx.shadowBlur = 20;
  drawRoundRect(ctx, 70, cardY, W - 140, cardH, 28, 'rgba(5,20,10,0.88)');
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(0,255,106,0.5)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.roundRect(70, cardY, W - 140, cardH, 28); ctx.stroke();

  // Card header
  ctx.textAlign = 'left';
  ctx.fillStyle = '#f0c040';
  ctx.font = 'bold 62px "Segoe UI", sans-serif';
  ctx.fillText('Resultados:', 130, cardY + 80);

  const medals = ['🏆', '🥈', '🥉'];
  rankings.forEach((r, i) => {
    const ry = cardY + 150 + i * 96;
    const isLast = i === rankings.length - 1;
    const medal = isLast ? '💩' : (medals[i] || `${i+1}.`);

    // Row bg for loser
    if (isLast) {
      ctx.globalAlpha = 0.25;
      drawRoundRect(ctx, 90, ry - 56, W - 180, 76, 12, '#ff2d6a');
      ctx.globalAlpha = 1;
    }

    ctx.font = '60px sans-serif';
    ctx.fillText(medal, 110, ry);
    ctx.font = isLast ? 'bold 58px "Segoe UI", sans-serif' : '56px "Segoe UI", sans-serif';
    ctx.fillStyle = isLast ? neonPink : '#ffffff';
    ctx.shadowColor = isLast ? neonPink : 'transparent';
    ctx.shadowBlur = isLast ? 12 : 0;
    ctx.fillText(r.name, 200, ry);
    ctx.shadowBlur = 0;
  });

  // ── TAGLINE ──
  const tagY = cardY + cardH + 90;
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = 'bold 72px "Segoe UI", Arial Black, sans-serif';
  ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 8;
  ctx.fillText('EL JUEGO QUE', cx, tagY);
  ctx.fillText('HUELE A DIVERSIÓN.', cx, tagY + 88);
  ctx.shadowBlur = 0;

  // ── CTA BUTTON (green pill) ──
  const btnY = tagY + 140;
  const btnW = 780, btnH = 110, btnX = cx - btnW / 2;
  const btnGrad = ctx.createLinearGradient(btnX, 0, btnX + btnW, 0);
  btnGrad.addColorStop(0, '#00d45a');
  btnGrad.addColorStop(1, '#00ff80');
  ctx.shadowColor = neonGreen; ctx.shadowBlur = 24;
  drawRoundRect(ctx, btnX, btnY, btnW, btnH, 55, btnGrad);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#0a1a0e';
  ctx.font = 'bold 52px "Segoe UI", sans-serif';
  ctx.fillText('¡JUEGA GRATIS EN EL NAVEGADOR!', cx, btnY + 73);

  // ── URL FOOTER ──
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.font = '44px "Segoe UI", sans-serif';
  ctx.fillText('Juega en:', cx, H - 160);
  ctx.shadowColor = '#f0c040'; ctx.shadowBlur = 16;
  ctx.fillStyle = '#f0c040';
  ctx.font = 'bold 60px "Segoe UI", sans-serif';
  ctx.fillText(roomUrl || 'caracaca.com', cx, H - 85);
  ctx.shadowBlur = 0;

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
