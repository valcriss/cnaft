import type { ElementType } from "./elements";

export type ElementCapabilities = {
  supportsFill: boolean;
  fillLabel?: string;
  supportsTheme: boolean;
  supportsStroke: boolean;
  supportsNoteTextColor: boolean;
  supportsLineStyle: boolean;
  supportsTextType: boolean;
  supportsEnvelopeType: boolean;
};

const ELEMENT_CAPABILITIES: Record<ElementType, ElementCapabilities> = {
  rectangle: {
    supportsFill: true,
    fillLabel: "Fond",
    supportsTheme: true,
    supportsStroke: true,
    supportsNoteTextColor: false,
    supportsLineStyle: false,
    supportsTextType: false,
    supportsEnvelopeType: false,
  },
  text: {
    supportsFill: true,
    fillLabel: "Couleur du texte",
    supportsTheme: false,
    supportsStroke: false,
    supportsNoteTextColor: false,
    supportsLineStyle: false,
    supportsTextType: true,
    supportsEnvelopeType: false,
  },
  note: {
    supportsFill: true,
    fillLabel: "Fond",
    supportsTheme: true,
    supportsStroke: true,
    supportsNoteTextColor: true,
    supportsLineStyle: false,
    supportsTextType: true,
    supportsEnvelopeType: false,
  },
  line: {
    supportsFill: false,
    supportsTheme: false,
    supportsStroke: true,
    supportsNoteTextColor: false,
    supportsLineStyle: true,
    supportsTextType: false,
    supportsEnvelopeType: false,
  },
  image: {
    supportsFill: false,
    supportsTheme: false,
    supportsStroke: true,
    supportsNoteTextColor: false,
    supportsLineStyle: false,
    supportsTextType: false,
    supportsEnvelopeType: false,
  },
  envelope: {
    supportsFill: true,
    fillLabel: "Fond",
    supportsTheme: true,
    supportsStroke: true,
    supportsNoteTextColor: true,
    supportsLineStyle: false,
    supportsTextType: true,
    supportsEnvelopeType: true,
  },
};

export function getElementCapabilities(type: ElementType): ElementCapabilities {
  return ELEMENT_CAPABILITIES[type];
}
