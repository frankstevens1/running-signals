import {
  siDatabricks,
  siGarmin,
  siNextdotjs,
  siPython,
  siPostgresql,
  siVercel,
} from "simple-icons";

type TechIcon = {
  path: string;
  viewBox?: string;
};

type TechLogoProps = {
  label: string;
  description: string;
  icon?: TechIcon;
  badge?: string;
};

// Inline the supplied SVG paths so they can share the Simple Icons color treatment reliably.
const awsS3Icon: TechIcon = {
  viewBox: "0 0 256 256",
  path: "m194.675 137.256 1.229-8.652c11.33 6.787 11.478 9.59 11.475 9.667-.02.016-1.952 1.629-12.704-1.015Zm-6.218-1.728c-19.584-5.926-46.857-18.438-57.894-23.654 0-.045.013-.086.013-.131 0-4.24-3.45-7.69-7.693-7.69-4.237 0-7.687 3.45-7.687 7.69s3.45 7.69 7.687 7.69c1.862 0 3.552-.695 4.886-1.8 12.986 6.148 40.048 18.478 59.776 24.302l-7.801 55.059c-.023.15-.032.3-.032.451 0 4.848-21.463 13.754-56.532 13.754-35.44 0-57.13-8.906-57.13-13.754a3.31 3.31 0 0 0-.028-.435l-16.3-119.062c14.108 9.712 44.454 14.85 73.478 14.85 28.979 0 59.273-5.12 73.41-14.802l-8.153 57.532ZM48 65.528c.23-4.21 24.428-20.73 75.2-20.73 50.764 0 74.966 16.516 75.2 20.73v1.437c-2.784 9.443-34.144 19.434-75.2 19.434-41.127 0-72.503-10.023-75.2-19.479v-1.392Zm156.8.07c0-11.087-31.79-27.2-81.6-27.2-49.812 0-81.6 16.113-81.6 27.2l.3 2.414 17.754 129.676c.426 14.503 39.1 19.91 63.526 19.91 30.31 0 62.512-6.969 62.928-19.9l7.668-54.07c4.265 1.02 7.776 1.542 10.595 1.542 3.785 0 6.345-.925 7.897-2.774 1.274-1.517 1.76-3.354 1.396-5.31-.83-4.428-6.087-9.202-16.794-15.311l7.603-53.639.327-2.537Z",
};

const dbtIcon: TechIcon = {
  viewBox: "0 0 256 256",
  path: "M245.121138,10.6473813 C251.139129,16.4340053 255.074133,24.0723342 256,32.4050489 C256,35.8769778 255.074133,38.1917867 252.990862,42.5895822 C250.907876,46.9873778 225.215147,91.4286933 217.57696,103.696213 C213.179164,110.871609 210.864356,119.435947 210.864356,127.768462 C210.864356,136.3328 213.179164,144.6656 217.57696,151.840996 C225.215147,164.108516 250.907876,208.781084 252.990862,213.179164 C255.074133,217.57696 256,219.659947 256,223.131876 C255.074133,231.464676 251.370667,239.103147 245.352676,244.658347 C239.565938,250.676338 231.927751,254.611342 223.826489,255.305671 C220.35456,255.305671 218.039751,254.379804 213.873493,252.296533 C209.706951,250.213262 164.340053,225.215147 152.072249,217.57696 C151.146382,217.113884 150.220516,216.419556 149.063396,215.95648 L88.4195556,180.079502 C89.8082133,191.652693 94.9006222,202.763093 103.233138,210.864356 C104.853618,212.484551 106.473813,213.873493 108.325547,215.262151 C106.936604,215.95648 105.316409,216.651093 103.927751,217.57696 C91.6599467,225.215147 46.9873778,250.907876 42.5895822,252.990862 C38.1917867,255.074133 36.1085156,256 32.4050489,256 C24.0723342,255.074133 16.4340053,251.370667 10.8788338,245.352676 C4.86075733,239.565938 0.925858133,231.927751 0,223.594951 C0.231464676,220.123022 1.1573248,216.651093 3.00905244,213.641956 C5.09223822,209.24416 30.7848533,164.571307 38.42304,152.303787 C42.82112,145.128391 45.1356444,136.795591 45.1356444,128.231538 C45.1356444,119.6672 42.82112,111.3344 38.42304,104.159004 C30.7848533,91.4286933 4.86075733,46.75584 3.00905244,42.3580444 C1.1573248,39.3489067 0.231464676,35.8769778 0,32.4050489 C0.925858133,24.0723342 4.62930489,16.4340053 10.6473813,10.6473813 C16.4340053,4.62930489 24.0723342,0.925858133 32.4050489,0 C35.8769778,0.231464676 39.3489067,1.1573248 42.5895822,3.00905244 C46.2930489,4.62930489 78.9293511,23.6094009 96.28928,33.7939911 L100.224284,36.1085156 C101.612942,37.0343822 102.770347,37.7287111 103.696213,38.1917867 L105.547947,39.3489067 L167.348907,75.9204978 C165.960249,62.0324978 158.784853,49.3019022 147.674453,40.7378489 C149.063396,40.04352 150.683591,39.3489067 152.072249,38.42304 C164.340053,30.7848533 209.012622,4.86075733 213.410418,3.00905244 C216.419556,1.1573248 219.891484,0.231464676 223.594951,0 C231.696213,0.925858133 239.334684,4.62930489 245.121138,10.6473813 Z M131.240391,144.434062 L144.434062,131.240391 C146.285796,129.388658 146.285796,126.611342 144.434062,124.759609 L131.240391,111.565938 C129.388658,109.714204 126.611342,109.714204 124.759609,111.565938 L111.565938,124.759609 C109.714204,126.611342 109.714204,129.388658 111.565938,131.240391 L124.759609,144.434062 C126.379804,146.054258 129.388658,146.054258 131.240391,144.434062 Z",
};

const logos: TechLogoProps[] = [
  {
    label: "Garmin",
    description: "Supplies activity and route telemetry source data.",
    icon: siGarmin,
  },
  {
    label: "Python",
    description: "Automates ingestion into the raw landing layer.",
    icon: siPython,
  },
  {
    label: "AWS S3",
    description: "Preserves recoverable raw FIT activity files.",
    icon: awsS3Icon,
  },
  {
    label: "Databricks",
    description: "Job orchestration and lakehouse management.",
    icon: siDatabricks,
  },
  {
    label: "dbt / SQL",
    description: "Tests and transforms silver and gold models.",
    icon: dbtIcon,
  },
  {
    label: "PostgreSQL",
    description: "Serves curated data for downstream applications.",
    icon: siPostgresql,
  },
  {
    label: "Next.js",
    description: "Builds and renders the presentation application.",
    icon: siNextdotjs,
  },
  {
    label: "Vercel",
    description: "Deploys and serves the presentation application.",
    icon: siVercel,
  },
];

export function TechLogo({ label, description, icon, badge }: TechLogoProps) {
  return (
    <div className="group border-r border-b border-(--border) px-4 py-4">
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center border border-(--border) bg-(--surface-muted) text-(--accent) transition-colors group-hover:border-(--accent)">
            {icon ? (
              <svg
                viewBox={icon.viewBox ?? "0 0 24 24"}
                className="h-5 w-5 fill-current"
                aria-hidden="true"
              >
                <path d={icon.path} />
              </svg>
            ) : (
              <span className="px-1 text-center font-mono text-[0.65rem] font-semibold uppercase leading-none">
                {badge}
              </span>
            )}
          </div>

          <p className="min-w-0 font-mono text-xs uppercase tracking-[0.12em] text-(--text)">
            {label}
          </p>
        </div>

        <p className="mt-3 text-xs leading-5 text-(--text-soft)">
          {description}
        </p>
      </div>
    </div>
  );
}

export function TechLogoGrid() {
  return (
    <div className="grid auto-rows-fr border-l border-t border-(--border) sm:grid-cols-2 lg:grid-cols-4">
      {logos.map((logo) => (
        <TechLogo key={logo.label} {...logo} />
      ))}
    </div>
  );
}
