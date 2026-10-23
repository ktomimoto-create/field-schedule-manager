// 拠点のアイコン（絵文字ではなく SVG）。東京＝東京タワー、大阪＝大阪城。色は currentColor。

interface Props {
  size?: number;
}

export const TokyoIcon = ({ size = 18 }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {/* 東京タワー: 細い塔・展望台 2 段・広がる脚 */}
    <path d="M12 2v3" />
    <path d="M10.5 5h3l-.4 4h-2.2z" />
    <path d="M9.6 9h4.8" />
    <path d="M10.9 9 8.5 15h7L13.1 9" />
    <path d="M8 15h8" />
    <path d="M8.5 15 6 22" />
    <path d="M15.5 15 18 22" />
    <path d="M9.5 19.5c1.5-1.3 3.5-1.3 5 0" />
  </svg>
);

export const OsakaIcon = ({ size = 18 }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {/* 大阪城: 3 段の屋根と石垣 */}
    <path d="M12 2.5v1.5" />
    <path d="M8.5 7 12 4l3.5 3z" />
    <path d="M9.5 7v2.5h5V7" />
    <path d="M6.5 12.5 12 9.5l5.5 3z" />
    <path d="M8 12.5v2.5h8v-2.5" />
    <path d="M4.5 18 12 15l7.5 3z" />
    <path d="M3 22l1.5-4h15l1.5 4z" />
  </svg>
);
