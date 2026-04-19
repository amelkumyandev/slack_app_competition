import type { OverridableComponent } from "@mui/material/OverridableComponent";
import type { SvgIconTypeMap } from "@mui/material/SvgIcon";

declare module "@mui/icons-material/*" {
  const content: OverridableComponent<SvgIconTypeMap<object, "svg">> & { muiName: string };
  export default content;
}
