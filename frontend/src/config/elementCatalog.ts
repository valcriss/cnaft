import type { IconProp } from "@fortawesome/fontawesome-svg-core";
import type { ElementType } from "../domain/elements";

export type AddableElementDefinition = {
  id: ElementType;
  icon: IconProp;
  title: string;
};

export const ADDABLE_ELEMENTS: AddableElementDefinition[] = [
  { id: "text", icon: "font", title: "Ajouter texte" },
  { id: "rectangle", icon: ["far", "square"], title: "Ajouter rectangle" },
  { id: "note", icon: ["far", "note-sticky"], title: "Ajouter note" },
  { id: "line", icon: "minus", title: "Ajouter ligne" },
  { id: "image", icon: "image", title: "Ajouter image" },
  { id: "envelope", icon: "object-group", title: "Ajouter enveloppe" },
];
