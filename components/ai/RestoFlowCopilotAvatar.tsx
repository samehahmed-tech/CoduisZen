import React from 'react';

type AvatarState = 'idle' | 'thinking' | 'success' | 'error';

type Props = {
    state?: AvatarState;
    reducedMotion?: boolean;
    label: string;
};

const RestoFlowCopilotAvatar: React.FC<Props> = ({ state = 'idle', reducedMotion = false, label }) => (
    <div
        className="rf-copilot-character"
        role="img"
        aria-label={label}
        data-avatar-state={state}
        data-reduced-motion={reducedMotion ? 'true' : 'false'}
    >
        <span className="rf-copilot-character-orbit rf-copilot-character-orbit--outer" aria-hidden="true" />
        <span className="rf-copilot-character-orbit rf-copilot-character-orbit--inner" aria-hidden="true" />
        <span className="rf-copilot-character-scan" aria-hidden="true" />
        <img
            src="/assets/ai/restoflow-copilot-3d-v1.png"
            alt=""
            className="rf-copilot-character-image"
            width="180"
            height="180"
            decoding="async"
        />
        <span className="rf-copilot-character-status" aria-hidden="true"><span /></span>
    </div>
);

export default RestoFlowCopilotAvatar;
