'use client';

import { useMapEvents } from 'react-leaflet';

interface MapEventsHandlerProps {
  onContextMenu: (lat: number, lng: number) => void;
}

export default function MapEventsHandler({ onContextMenu }: MapEventsHandlerProps) {
  useMapEvents({
    contextmenu: (e) => {
      e.originalEvent.preventDefault();
      onContextMenu(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}
