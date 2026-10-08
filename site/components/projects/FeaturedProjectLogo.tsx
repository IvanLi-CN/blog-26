import { classList, cssStyle } from "../../lib/react-template";

interface Props {
  src: string;
  darkSrc?: string;
  kind: "native" | "mask";
  label: string;
  colorLight?: string;
  colorDark?: string;
  variant: "inline" | "watermark";
}
export default function FeaturedProjectLogo(props: Props) {
  const { src, darkSrc, kind, label, colorLight, colorDark, variant } = props;
  const isWatermark = variant === "watermark";
  const style =
    kind === "mask"
      ? `--featured-project-logo-src: url(${JSON.stringify(src)}); --featured-project-logo-color-light: ${colorLight}; --featured-project-logo-color-dark: ${colorDark};`
      : undefined;
  return (
    <span
      className={classList([
        "featured-project-logo",
        `featured-project-logo-${variant}`,
        `featured-project-logo-${kind}`,
        { "featured-project-logo-has-dark": Boolean(darkSrc) },
      ])}
      data-featured-project-logo=""
      data-logo-kind={kind}
      data-logo-variant={variant}
      aria-hidden={isWatermark ? "true" : undefined}
      aria-label={!isWatermark ? label : undefined}
      role="img"
      style={cssStyle(style)}
    >
      {kind === "mask" ? (
        <span className="featured-project-logo-mask" aria-hidden="true"></span>
      ) : (
        <>
          <img
            className="featured-project-logo-image featured-project-logo-light"
            src={src}
            alt=""
          />
          {darkSrc && (
            <img
              className="featured-project-logo-image featured-project-logo-dark"
              src={darkSrc}
              alt=""
            />
          )}
        </>
      )}
    </span>
  );
}
