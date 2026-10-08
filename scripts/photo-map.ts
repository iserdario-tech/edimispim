/** Какой снимок у каждого из последних 15 рецептов: проверка правил photos.ts после партии. Запуск: npx vite-node scripts/photo-map.ts */
import recipes from "../src/food/data/recipes.json";
import { photoFor, PHOTOS } from "../src/food/photos";
const kindOf = (file: string) => Object.entries(PHOTOS).find(([, p]) => p.file === file)?.[0];
for (const r of (recipes as any[]).slice(-15)) console.log(`${kindOf(photoFor(r).file)}\t${r.name}`);
