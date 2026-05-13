import { invoke } from '@tauri-apps/api/core';

export interface BackendInfo {
  url: string;
  token: string;
}

export async function invokeGetBackend(): Promise<BackendInfo | null> {
  return invoke<BackendInfo | null>('get_backend');
}

export interface SystemLocation {
  lat: number;
  lng: number;
}

export async function invokeGetSystemLocation(): Promise<SystemLocation> {
  return invoke<SystemLocation>('get_system_location');
}
