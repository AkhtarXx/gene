import Markdown from 'react-native-marked';
import { useTheme } from './theme';

/** Chat markdown: lists, code blocks, bold/italic/links — theme-aware. */
export function MarkdownText({ value }: { value: string }) {
  const { color } = useTheme();
  return (
    <Markdown
      value={value}
      flatListProps={{
        style: { backgroundColor: 'transparent' },
        showsVerticalScrollIndicator: false,
        scrollEnabled: false,
      }}
      theme={{
        colors: {
          text: color.text,
          code: color.surface2,
          link: color.accent,
          border: color.border,
        },
      }}
      styles={{
        text: { fontSize: 15, lineHeight: 22, color: color.text },
        codespan: { backgroundColor: color.surface2, color: color.text },
        code: { backgroundColor: color.surface2, borderColor: color.border },
        codeText: { color: color.text },
      }}
    />
  );
}
