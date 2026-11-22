import logoSource from '../assets/infralens-logo.svg?inline'
import { Box } from '../ui/box'
import { Image } from '../ui/image'
import { Text } from '../ui/text'
import { logoStyles } from './logo.variants'

export const Logo = () => (
  <Box className={logoStyles.root}>
    <Image className={logoStyles.mark} src={logoSource} alt="" />
    <Text className={logoStyles.name}>InfraLens</Text>
  </Box>
)
