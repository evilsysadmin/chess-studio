import { FILES } from './Board3DConfig.js';
import { makeTextSprite } from './Board3DScene.js';

// Board labels are static decoration: construct them exactly once per board
// mount, in the correct orientation. The render core owns no sprite layout.
export function installBoard3DCoordinates(coordinateGroup, whiteSide) {
  const fileOrder = whiteSide ? FILES : [...FILES].reverse();
  const rankOrder = whiteSide
    ? ['1', '2', '3', '4', '5', '6', '7', '8']
    : ['8', '7', '6', '5', '4', '3', '2', '1'];
  fileOrder.forEach((file, index) => {
    const sprite = makeTextSprite(file.toUpperCase(), '#d4aa54');
    sprite.position.set(index - 3.5, 0.16, whiteSide ? 4.68 : -4.68);
    coordinateGroup.add(sprite);
  });
  rankOrder.forEach((rank, index) => {
    const sprite = makeTextSprite(rank, '#d4aa54');
    sprite.position.set(whiteSide ? -4.68 : 4.68, 0.16, whiteSide ? 3.5 - index : -3.5 + index);
    coordinateGroup.add(sprite);
  });
}
