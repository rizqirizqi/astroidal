const ASTROID_PATH =
  "M32.0 18.0 L31.9 18.0 L31.6 18.0 L31.2 18.1 L30.6 18.2 L29.9 18.5 L29.0 18.8 L28.1 19.2 L27.1 19.8 L26.0 20.4 L25.0 21.2 L23.9 22.0 L22.9 22.9 L22.0 23.9 L21.2 25.0 L20.4 26.0 L19.8 27.1 L19.2 28.1 L18.8 29.0 L18.5 29.9 L18.2 30.6 L18.1 31.2 L18.0 31.6 L18.0 31.9 L18.0 32.0 L18.0 31.9 L18.0 31.6 L17.9 31.2 L17.8 30.6 L17.5 29.9 L17.2 29.0 L16.8 28.1 L16.3 27.1 L15.6 26.0 L14.8 25.0 L14.0 23.9 L13.1 22.9 L12.1 22.0 L11.0 21.2 L10.0 20.4 L8.9 19.8 L7.9 19.2 L7.0 18.8 L6.1 18.5 L5.4 18.2 L4.8 18.1 L4.4 18.0 L4.1 18.0 L4.0 18.0 L4.1 18.0 L4.4 18.0 L4.8 17.9 L5.4 17.8 L6.1 17.5 L7.0 17.2 L7.9 16.8 L8.9 16.3 L10.0 15.6 L11.0 14.8 L12.1 14.0 L13.1 13.1 L14.0 12.1 L14.8 11.0 L15.6 10.0 L16.2 8.9 L16.8 7.9 L17.2 7.0 L17.5 6.1 L17.8 5.4 L17.9 4.8 L18.0 4.4 L18.0 4.1 L18.0 4.0 L18.0 4.1 L18.0 4.4 L18.1 4.8 L18.2 5.4 L18.5 6.1 L18.8 7.0 L19.2 7.9 L19.8 8.9 L20.4 10.0 L21.2 11.0 L22.0 12.1 L22.9 13.1 L23.9 14.0 L25.0 14.8 L26.0 15.6 L27.1 16.2 L28.1 16.8 L29.0 17.2 L29.9 17.5 L30.6 17.8 L31.2 17.9 L31.6 18.0 L31.9 18.0 L32.0 18.0 Z";

interface MarkProps {
  className?: string;
  title?: string;
}

export function Mark({ className, title }: MarkProps) {
  return (
    <svg
      viewBox="0 0 36 36"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <path
        d={ASTROID_PATH}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}
