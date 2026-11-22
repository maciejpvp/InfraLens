import { diagramStyles as styles } from './diagram.variants'

export const ServiceIcon = ({ icon }: { icon?: string }) =>
  icon ? (
    <img className={styles.serviceIcon} src={icon} alt="" aria-hidden="true" />
  ) : (
    <span className={styles.fallbackIcon} aria-hidden="true">
      ◇
    </span>
  )
