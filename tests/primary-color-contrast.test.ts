import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const tokens = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8');
const themes = ['light', 'dark', 'eye-care', 'high-contrast'] as const;
const accents = ['blue', 'green', 'orange', 'purple', 'rose'] as const;

type Palette = Record<string, string>;

function readPalette(selector: string): Palette {
	const match = tokens.match(new RegExp(`${selector}\\s*\\{([\\s\\S]*?)\\n\\}`));
	assert.ok(match, `未找到令牌选择器：${selector}`);

	return Object.fromEntries(
		[...match[1].matchAll(/--([a-z-]+):\s*(#[0-9a-fA-F]{6});/g)].map(([, name, value]) => [name, value])
	);
}

function luminance(color: string): number {
	const channels = color
		.slice(1)
		.match(/../g)!
		.map((hex) => parseInt(hex, 16) / 255)
		.map((channel) =>
			channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
		);

	return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(foreground: string, background: string): number {
	const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
	return (lighter + 0.05) / (darker + 0.05);
}

for (const theme of themes) {
	test(`主题默认主色前景对比度：${theme}`, () => {
		const palette = readPalette(`\\[data-theme='${theme}'\\]`);

		assert.ok(
			contrastRatio(palette['color-primary-foreground'], palette['color-primary']) >= 4.5,
			`默认主色前景不足 4.5:1（${theme}）`
		);
		assert.ok(
			contrastRatio(palette['color-primary-hover-foreground'], palette['color-primary-hover']) >= 4.5,
			`悬停主色前景不足 4.5:1（${theme}）`
		);
	});

	for (const accent of accents) {
		test(`主色前景对比度：${theme} + ${accent}`, () => {
			const palette = {
				...readPalette(`\\[data-theme='${theme}'\\]`),
				...readPalette(`\\[data-accent='${accent}'\\]`)
			};

			assert.ok(
				contrastRatio(palette['color-primary-foreground'], palette['color-primary']) >= 4.5,
				`默认主色前景不足 4.5:1（${theme} + ${accent}）`
			);
			assert.ok(
				contrastRatio(palette['color-primary-hover-foreground'], palette['color-primary-hover']) >= 4.5,
				`悬停主色前景不足 4.5:1（${theme} + ${accent}）`
			);
		});
	}
}
