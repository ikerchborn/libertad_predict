import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const imgDir = path.resolve('public/images/places');
const files = fs.readdirSync(imgDir).filter(f => f.endsWith('.jpg') && !f.startsWith('temp_'));

for (const file of files) {
  const fullPath = path.join(imgDir, file);
  const inputBuffer = fs.readFileSync(fullPath);
  const meta = await sharp(inputBuffer).metadata();
  console.log(`Optimizing ${file} (${meta.width}x${meta.height}, ${(inputBuffer.length / 1024 / 1024).toFixed(2)} MB)...`);
  
  const optimizedBuffer = await sharp(inputBuffer)
    .resize({ width: 1200, withoutEnlargement: true })
    .jpeg({ quality: 82, progressive: true })
    .toBuffer();
    
  fs.writeFileSync(fullPath, optimizedBuffer);
  
  const newSize = (optimizedBuffer.length / 1024).toFixed(1);
  console.log(`-> Saved ${file}: ${newSize} KB`);
}
console.log('Image optimization complete!');
