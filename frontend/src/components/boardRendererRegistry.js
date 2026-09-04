let registeredBoard3D = null;

export function registerBoard3D(component) {
  registeredBoard3D = component || null;
  return registeredBoard3D;
}

export function getRegisteredBoard3D() {
  return registeredBoard3D;
}
