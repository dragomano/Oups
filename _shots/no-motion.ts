/**
 * Turn off every CSS transition and keyframe animation on this page.
 *
 * A transition caught mid-flight rasterizes differently on each run: the
 * priority picker's chevron (`transition: transform 0.15s`) alone made the
 * `04-editor` shot churn its bytes on every regeneration. With motion off the
 * page sits on its final frame before `data-shots-ready` is raised, so equal
 * input produces byte-identical PNGs. Import this as early as freeze-clock.
 */

const style = document.createElement("style");

// `!important` wins over any authored transition or animation property.
style.textContent = "*, *::before, *::after { transition: none !important; animation: none !important; }";
document.head.append(style);
