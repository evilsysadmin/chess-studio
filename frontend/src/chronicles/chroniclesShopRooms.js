import odoForge from '../assets/chronicles/ui/shops/odo-forge.png';
import brunnaArmory from '../assets/chronicles/ui/shops/brunna-armory.png';
import guildSanctum from '../assets/chronicles/ui/shops/guild-sanctum.png';

// MM3 shows the shopkeeper in their room. The room follows the building the
// counter belongs to (`visualType: building-<style>` on the shop entry).
const ROOMS = Object.freeze({
  'building-armor': Object.freeze({ id: 'odo-forge', src: odoForge, alt: 'La forja: el herrero, el yunque y el fuego' }),
  'building-forge': Object.freeze({ id: 'brunna-armory', src: brunnaArmory, alt: 'La armería: armas en los armeros y la tendera tras el mostrador' }),
  'building-guild': Object.freeze({ id: 'guild-sanctum', src: guildSanctum, alt: 'El gremio: grimorios, velas, un caldero y la archivista encapuchada' }),
});

export function chroniclesShopRoom(entry) {
  return ROOMS[entry?.visualType] || null;
}
