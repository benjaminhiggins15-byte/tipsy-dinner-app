import { r as reactExports } from "./react.mjs";
var defaultAttributes = {
  outline: {
    xmlns: "http://www.w3.org/2000/svg",
    width: 24,
    height: 24,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round"
  },
  filled: {
    xmlns: "http://www.w3.org/2000/svg",
    width: 24,
    height: 24,
    viewBox: "0 0 24 24",
    fill: "currentColor",
    stroke: "none"
  }
};
const createReactComponent = (type, iconName, iconNamePascal, iconNode) => {
  const Component = reactExports.forwardRef(
    ({ color = "currentColor", size = 24, stroke = 2, title, className, children, ...rest }, ref) => reactExports.createElement(
      "svg",
      {
        ref,
        ...defaultAttributes[type],
        width: size,
        height: size,
        className: [`tabler-icon`, `tabler-icon-${iconName}`, className].join(" "),
        ...{
          strokeWidth: stroke,
          stroke: color
        },
        ...rest
      },
      [
        title && reactExports.createElement("title", { key: "svg-title" }, title),
        ...iconNode.map(([tag, attrs]) => reactExports.createElement(tag, attrs)),
        ...Array.isArray(children) ? children : [children]
      ]
    )
  );
  Component.displayName = `${iconNamePascal}`;
  return Component;
};
const __iconNode$h = [["path", { "d": "M3 19a9 9 0 0 1 9 0a9 9 0 0 1 9 0", "key": "svg-0" }], ["path", { "d": "M3 6a9 9 0 0 1 9 0a9 9 0 0 1 9 0", "key": "svg-1" }], ["path", { "d": "M3 6l0 13", "key": "svg-2" }], ["path", { "d": "M12 6l0 13", "key": "svg-3" }], ["path", { "d": "M21 6l0 13", "key": "svg-4" }]];
const IconBook = createReactComponent("outline", "book", "Book", __iconNode$h);
const __iconNode$g = [["path", { "d": "M4 11h16a1 1 0 0 1 1 1v.5c0 1.5 -2.517 5.573 -4 6.5v1a1 1 0 0 1 -1 1h-8a1 1 0 0 1 -1 -1v-1c-1.687 -1.054 -4 -5 -4 -6.5v-.5a1 1 0 0 1 1 -1", "key": "svg-0" }], ["path", { "d": "M8 7c1.657 0 3 -.895 3 -2s-1.343 -2 -3 -2s-3 .895 -3 2s1.343 2 3 2", "key": "svg-1" }], ["path", { "d": "M11 5h9", "key": "svg-2" }]];
const IconBowlSpoon = createReactComponent("outline", "bowl-spoon", "BowlSpoon", __iconNode$g);
const __iconNode$f = [["path", { "d": "M3 20h18v-8a3 3 0 0 0 -3 -3h-12a3 3 0 0 0 -3 3v8", "key": "svg-0" }], ["path", { "d": "M3 14.803c.312 .135 .654 .204 1 .197a2.4 2.4 0 0 0 2 -1a2.4 2.4 0 0 1 2 -1a2.4 2.4 0 0 1 2 1a2.4 2.4 0 0 0 2 1a2.4 2.4 0 0 0 2 -1a2.4 2.4 0 0 1 2 -1a2.4 2.4 0 0 1 2 1a2.4 2.4 0 0 0 2 1c.35 .007 .692 -.062 1 -.197", "key": "svg-1" }], ["path", { "d": "M12 4l1.465 1.638a2 2 0 1 1 -3.015 .099l1.55 -1.737", "key": "svg-2" }]];
const IconCake = createReactComponent("outline", "cake", "Cake", __iconNode$f);
const __iconNode$e = [["path", { "d": "M9 21h6v-10a1 1 0 0 0 -1 -1h-4a1 1 0 0 0 -1 1l0 10", "key": "svg-0" }], ["path", { "d": "M12 2l1.465 1.638a2 2 0 1 1 -3.015 .099l1.55 -1.737", "key": "svg-1" }]];
const IconCandle = createReactComponent("outline", "candle", "Candle", __iconNode$e);
const __iconNode$d = [["path", { "d": "M12 3c1.918 0 3.52 1.35 3.91 3.151a4 4 0 0 1 2.09 7.723l0 7.126h-12v-7.126a4 4 0 1 1 2.092 -7.723a4 4 0 0 1 3.908 -3.151", "key": "svg-0" }], ["path", { "d": "M6.161 17.009l11.839 -.009", "key": "svg-1" }]];
const IconChefHat = createReactComponent("outline", "chef-hat", "ChefHat", __iconNode$d);
const __iconNode$c = [["path", { "d": "M12 10.941c2.333 -3.308 .167 -7.823 -1 -8.941c0 3.395 -2.235 5.299 -3.667 6.706c-1.43 1.408 -2.333 3.294 -2.333 5.588c0 3.704 3.134 6.706 7 6.706c3.866 0 7 -3.002 7 -6.706c0 -1.712 -1.232 -4.403 -2.333 -5.588c-2.084 3.353 -3.257 3.353 -4.667 2.235", "key": "svg-0" }]];
const IconFlame = createReactComponent("outline", "flame", "Flame", __iconNode$c);
const __iconNode$b = [["path", { "d": "M8 21l8 0", "key": "svg-0" }], ["path", { "d": "M12 15l0 6", "key": "svg-1" }], ["path", { "d": "M17 3l1 7c0 3.012 -2.686 5 -6 5s-6 -1.988 -6 -5l1 -7h10", "key": "svg-2" }], ["path", { "d": "M6 10a5 5 0 0 1 6 0a5 5 0 0 0 6 0", "key": "svg-3" }]];
const IconGlassFull = createReactComponent("outline", "glass-full", "GlassFull", __iconNode$b);
const __iconNode$a = [["path", { "d": "M19 8h-14a6 6 0 0 0 6 6h2a6 6 0 0 0 6 -5.775l0 -.225", "key": "svg-0" }], ["path", { "d": "M17 20a2 2 0 1 1 0 -4a2 2 0 0 1 0 4", "key": "svg-1" }], ["path", { "d": "M15 14l1 2", "key": "svg-2" }], ["path", { "d": "M9 14l-3 6", "key": "svg-3" }], ["path", { "d": "M15 18h-8", "key": "svg-4" }], ["path", { "d": "M15 5v-1", "key": "svg-5" }], ["path", { "d": "M12 5v-1", "key": "svg-6" }], ["path", { "d": "M9 5v-1", "key": "svg-7" }]];
const IconGrill = createReactComponent("outline", "grill", "Grill", __iconNode$a);
const __iconNode$9 = [["path", { "d": "M19.5 12.572l-7.5 7.428l-7.5 -7.428a5 5 0 1 1 7.5 -6.566a5 5 0 1 1 7.5 6.572", "key": "svg-0" }]];
const IconHeart = createReactComponent("outline", "heart", "Heart", __iconNode$9);
const __iconNode$8 = [["path", { "d": "M4 6a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v2a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2l0 -2", "key": "svg-0" }], ["path", { "d": "M4 16a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v2a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2l0 -2", "key": "svg-1" }]];
const IconLayoutList = createReactComponent("outline", "layout-list", "LayoutList", __iconNode$8);
const __iconNode$7 = [["path", { "d": "M5 21c.5 -4.5 2.5 -8 7 -10", "key": "svg-0" }], ["path", { "d": "M9 18c6.218 0 10.5 -3.288 11 -12v-2h-4.014c-9 0 -11.986 4 -12 9c0 1 0 3 2 5h3l.014 0", "key": "svg-1" }]];
const IconLeaf = createReactComponent("outline", "leaf", "Leaf", __iconNode$7);
const __iconNode$6 = [["path", { "d": "M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454l0 .008", "key": "svg-0" }]];
const IconMoon = createReactComponent("outline", "moon", "Moon", __iconNode$6);
const __iconNode$5 = [["path", { "d": "M12 21.5c-3.04 0 -5.952 -.714 -8.5 -1.983l8.5 -16.517l8.5 16.517a19.09 19.09 0 0 1 -8.5 1.983", "key": "svg-0" }], ["path", { "d": "M5.38 15.866a14.94 14.94 0 0 0 6.815 1.634a14.944 14.944 0 0 0 6.502 -1.479", "key": "svg-1" }], ["path", { "d": "M13 11.01v-.01", "key": "svg-2" }], ["path", { "d": "M11 14v-.01", "key": "svg-3" }]];
const IconPizza = createReactComponent("outline", "pizza", "Pizza", __iconNode$5);
const __iconNode$4 = [["path", { "d": "M10 4l2 1l2 -1", "key": "svg-0" }], ["path", { "d": "M12 2v6.5l3 1.72", "key": "svg-1" }], ["path", { "d": "M17.928 6.268l.134 2.232l1.866 1.232", "key": "svg-2" }], ["path", { "d": "M20.66 7l-5.629 3.25l.01 3.458", "key": "svg-3" }], ["path", { "d": "M19.928 14.268l-1.866 1.232l-.134 2.232", "key": "svg-4" }], ["path", { "d": "M20.66 17l-5.629 -3.25l-2.99 1.738", "key": "svg-5" }], ["path", { "d": "M14 20l-2 -1l-2 1", "key": "svg-6" }], ["path", { "d": "M12 22v-6.5l-3 -1.72", "key": "svg-7" }], ["path", { "d": "M6.072 17.732l-.134 -2.232l-1.866 -1.232", "key": "svg-8" }], ["path", { "d": "M3.34 17l5.629 -3.25l-.01 -3.458", "key": "svg-9" }], ["path", { "d": "M4.072 9.732l1.866 -1.232l.134 -2.232", "key": "svg-10" }], ["path", { "d": "M3.34 7l5.629 3.25l2.99 -1.738", "key": "svg-11" }]];
const IconSnowflake = createReactComponent("outline", "snowflake", "Snowflake", __iconNode$4);
const __iconNode$3 = [["path", { "d": "M12 17.75l-6.172 3.245l1.179 -6.873l-5 -4.867l6.9 -1l3.086 -6.253l3.086 6.253l6.9 1l-5 4.867l1.179 6.873l-6.158 -3.245", "key": "svg-0" }]];
const IconStar = createReactComponent("outline", "star", "Star", __iconNode$3);
const __iconNode$2 = [["path", { "d": "M8 12a4 4 0 1 0 8 0a4 4 0 1 0 -8 0", "key": "svg-0" }], ["path", { "d": "M3 12h1m8 -9v1m8 8h1m-9 8v1m-6.4 -15.4l.7 .7m12.1 -.7l-.7 .7m0 11.4l.7 .7m-12.1 -.7l-.7 .7", "key": "svg-1" }]];
const IconSun = createReactComponent("outline", "sun", "Sun", __iconNode$2);
const __iconNode$1 = [["path", { "d": "M19 3v12h-5c-.023 -3.681 .184 -7.406 5 -12m0 12v6h-1v-3m-10 -14v17m-3 -17v3a3 3 0 1 0 6 0v-3", "key": "svg-0" }]];
const IconToolsKitchen2 = createReactComponent("outline", "tools-kitchen-2", "ToolsKitchen2", __iconNode$1);
const __iconNode = [["path", { "d": "M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0", "key": "svg-0" }], ["path", { "d": "M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2", "key": "svg-1" }]];
const IconUser = createReactComponent("outline", "user", "User", __iconNode);
export {
  IconChefHat as I,
  IconBook as a,
  IconLayoutList as b,
  IconUser as c,
  IconCandle as d,
  IconGrill as e,
  IconCake as f,
  IconGlassFull as g,
  IconHeart as h,
  IconStar as i,
  IconSun as j,
  IconMoon as k,
  IconSnowflake as l,
  IconFlame as m,
  IconLeaf as n,
  IconToolsKitchen2 as o,
  IconBowlSpoon as p,
  IconPizza as q
};
