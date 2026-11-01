import React from 'react';
import Icon from './Icon.jsx';

// галочка «ник подтверждён через Ely.by» (вкладка «Друзья», профиль)
export default function ElyOk({ on, t }) {
  if (!on) return null;
  return <span className="fr-ely" title={t('Ник подтверждён через Ely.by — этот ник принадлежит именно этому игроку')}><Icon name="check" size={10} /></span>;
}
