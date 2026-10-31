import {lvIcon} from './icons/LvIcon';

// Original LV 28x28 1px-stroke icons for the Object tree toolbar entries that the shared
// registry does not carry yet. Same rendering contract as src/ui/icons (currentColor stroke,
// decorative unless titled). They may move into the registry later.
const BOX={width:28,height:28};
/** Create a group of drawings: a folder with a plus. */
export const ObjectTreeGroupIcon=lvIcon('object-tree-group',BOX,<path d="M4.5 8.5V21.5H23.5V10.5H13.5L11.5 8.5ZM14 13V19M11 16H17"/>);
/** Clone, Copy: two offset sheets. */
export const ObjectTreeCloneIcon=lvIcon('object-tree-clone',BOX,<><rect x={9.5} y={9.5} width={13} height={14}/><path d="M6.5 19.5V5.5H18.5V7"/></>);
/** Move to: two stacked panes and a vertical double arrow. */
export const ObjectTreeMoveToIcon=lvIcon('object-tree-move-to',BOX,<path d="M4.5 5.5H17.5V11.5H4.5ZM4.5 16.5H17.5V22.5H4.5ZM22.5 7V21M20 9.5L22.5 7L25 9.5M20 18.5L22.5 21L25 18.5"/>);
/** Manage layout drawings: a list with a small gear. */
export const ObjectTreeManageIcon=lvIcon('object-tree-manage',BOX,<><path d="M4.5 7.5H17.5M4.5 12.5H14.5M4.5 17.5H11.5M20.5 13V14.5M20.5 22.5V24M15.5 18.5H17M24 18.5H25.5"/><circle cx={20.5} cy={18.5} r={2.5}/></>);
