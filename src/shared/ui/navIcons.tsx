import type { SVGProps } from 'react';
import { PATHS } from './iconPaths';

// Astryx의 icon 슬롯(SideNavItem 등)은 SVG 컴포넌트를 받는다. 같은 그림을 컴포넌트로 넘긴다.
function svg(props: SVGProps<SVGSVGElement>, name: keyof typeof PATHS) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...props}>{PATHS[name]}</svg>;
}
export const GridIcon = (props: SVGProps<SVGSVGElement>) => svg(props, 'grid');
export const ChipIcon = (props: SVGProps<SVGSVGElement>) => svg(props, 'chip');
export const DocIcon = (props: SVGProps<SVGSVGElement>) => svg(props, 'doc');
